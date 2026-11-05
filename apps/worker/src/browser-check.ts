import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Project, Ticket } from "@simple-jira/core";
import { config } from "./config";
import { db } from "./db";
import type { TicketLogger } from "./logger";

export const SCREENS_BUCKET = "ticket-screens";

// The subset of playwright-core used here, so the worker typechecks and runs without it installed.
interface Page {
  on(event: "console", handler: (message: { type(): string; text(): string }) => void): void;
  on(event: "pageerror", handler: (error: Error) => void): void;
  on(event: "requestfailed", handler: (request: { url(): string; failure(): { errorText: string } | null }) => void): void;
  on(event: "response", handler: (response: { url(): string; status(): number }) => void): void;
  goto(url: string, options: { waitUntil: "load" | "networkidle"; timeout: number }): Promise<{ status(): number } | null>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(options: { path: string; fullPage: boolean }): Promise<unknown>;
  title(): Promise<string>;
  close(): Promise<void>;
}
interface Browser {
  newContext(options: { viewport: { width: number; height: number } }): Promise<{ newPage(): Promise<Page> }>;
  close(): Promise<void>;
}
interface Chromium {
  launch(options: { channel?: string; headless: boolean }): Promise<Browser>;
}

export interface Screen {
  path: string;
  status: number | null;
  title: string;
  local: string;
  storage: string | null;
}

export interface BrowserResult {
  ok: boolean;
  previewUrl: string;
  screens: Screen[];
  consoleErrors: string[];
  failedRequests: string[];
  skipped?: string;
}

async function loadChromium(): Promise<Chromium | null> {
  const name = "playwright-core";
  try {
    const module = (await import(name)) as { chromium: Chromium };
    return module.chromium;
  } catch {
    return null;
  }
}

async function launch(chromium: Chromium): Promise<Browser> {
  // An installed Edge or Chrome avoids downloading a browser.
  const channels = [...new Set([config.browserChannel, "msedge", "chrome"])];
  let lastError: unknown;
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function fileName(path: string) {
  return `${path.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-") || "home"}.png`;
}

async function upload(ticketNumber: number, local: string, name: string): Promise<string | null> {
  const key = `${ticketNumber}/${Date.now()}-${name}`;
  const { error } = await db.storage
    .from(SCREENS_BUCKET)
    .upload(key, readFileSync(local), { contentType: "image/png", upsert: true });
  return error ? null : key;
}

export async function signedScreenUrls(screens: Screen[], seconds: number): Promise<Map<string, string>> {
  const keys = screens.map((screen) => screen.storage).filter((key): key is string => !!key);
  const urls = new Map<string, string>();
  if (!keys.length) return urls;
  const { data } = await db.storage.from(SCREENS_BUCKET).createSignedUrls(keys, seconds);
  for (const entry of data ?? []) if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
  return urls;
}

export function wantsBrowserCheck(project: Project): boolean {
  return config.browserCheck && project.browser_check !== false;
}

// Loads the preview in a headless browser, collects errors and screenshots. Never throws: the ticket stays delivered.
export async function browserCheck(
  ticket: Pick<Ticket, "number" | "check_paths">,
  previewUrl: string,
  log: TicketLogger,
): Promise<BrowserResult> {
  const result: BrowserResult = { ok: false, previewUrl, screens: [], consoleErrors: [], failedRequests: [] };
  const chromium = await loadChromium();
  if (!chromium) {
    result.skipped = "playwright-core is not installed in apps/worker (pnpm install)";
    log.event("browser", `Browser test not run: ${result.skipped}`, { ...result });
    return result;
  }

  const dir = join(config.screensDir, String(ticket.number));
  mkdirSync(dir, { recursive: true });
  const paths = ticket.check_paths?.length ? ticket.check_paths : ["/"];
  let browser: Browser | null = null;
  try {
    browser = await launch(chromium);
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    page.on("console", (message) => {
      if (message.type() === "error") result.consoleErrors.push(message.text().slice(0, 300));
    });
    page.on("pageerror", (error) => result.consoleErrors.push(error.message.slice(0, 300)));
    page.on("requestfailed", (request) =>
      result.failedRequests.push(`${request.failure()?.errorText ?? "failed"} ${request.url().slice(0, 200)}`),
    );
    page.on("response", (response) => {
      if (response.status() >= 400) result.failedRequests.push(`HTTP ${response.status()} ${response.url().slice(0, 200)}`);
    });

    for (const path of paths) {
      const url = new URL(path, previewUrl).toString();
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 }).catch(async () => {
        await page.waitForTimeout(2000);
        return null;
      });
      const name = fileName(path);
      const local = join(dir, name);
      await page.screenshot({ path: local, fullPage: true });
      const storage = await upload(ticket.number, local, name).catch(() => null);
      result.screens.push({ path, status: response?.status() ?? null, title: await page.title(), local, storage });
    }
    await page.close();

    const badStatus = result.screens.some((screen) => screen.status !== null && screen.status >= 400);
    result.ok = !badStatus && result.consoleErrors.length === 0;
  } catch (error) {
    result.skipped = `browser unavailable: ${(error as Error).message.split("\n")[0]}`;
  } finally {
    await browser?.close().catch(() => undefined);
  }

  result.consoleErrors = [...new Set(result.consoleErrors)].slice(0, 20);
  result.failedRequests = [...new Set(result.failedRequests)].slice(0, 20);
  log.event("browser", browserSummary(result), { ...result });
  return result;
}

export function browserSummary(result: BrowserResult): string {
  if (result.skipped && !result.screens.length) return `Browser test inconclusive: ${result.skipped}`;
  const pages = result.screens.map((screen) => `${screen.path} (${screen.status ?? "?"})`).join(", ");
  const lines = [
    `${result.ok ? "✓" : "⚠"} Browser test on the preview: ${pages}`,
    `${result.consoleErrors.length} console error(s), ${result.failedRequests.length} failed request(s)`,
    ...result.consoleErrors.slice(0, 5).map((line) => `console: ${line}`),
    ...result.failedRequests.slice(0, 5).map((line) => `network: ${line}`),
  ];
  if (result.screens.some((screen) => !screen.storage)) {
    lines.push(`Local screenshots: ${result.screens.map((screen) => screen.local).join(", ")}`);
  }
  return lines.join("\n");
}
