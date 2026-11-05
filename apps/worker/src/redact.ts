import { config } from "./config";

const TOKENS: RegExp[] = [
  /sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g,
  /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  /\bsk-(ant-)?[A-Za-z0-9_-]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b(Bearer|token)\s+[A-Za-z0-9._~+/-]{20,}=*/gi,
];
const ASSIGNMENT = /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/g;

function secretValues(): string[] {
  const values = [config.supabaseSecretKey];
  for (const [name, value] of Object.entries(process.env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD/i.test(name) && value) values.push(value);
  }
  return values.filter((value) => value.length >= 8);
}

// Masks secrets before anything reaches the journal, the PR or a notification.
export function redact(text: string): string {
  let out = text;
  for (const value of secretValues()) out = out.split(value).join("***");
  for (const pattern of TOKENS) out = out.replace(pattern, "***");
  return out.replace(ASSIGNMENT, (_, name: string, sep: string) => `${name}${sep}***`);
}

export function truncate(text: string, max = 2000): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
