"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      const active = document.activeElement;
      if (active && EDITABLE.has(active.tagName)) return;
      // An open form on the page: refreshing would reset what the user is typing.
      if (document.querySelector("[data-pause-refresh]")) return;
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return null;
}
