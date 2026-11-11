"use client";

import { Eye, EyeOff } from "lucide-react";
import { useSyncExternalStore } from "react";

const KEY = "aditya-show-sensitive";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Sensitive memories are blurred by default; reveal is per browser tab session. */
export function useSensitiveVisible() {
  const visible = useSyncExternalStore(subscribe, read, () => false);
  const set = (v: boolean) => {
    try {
      sessionStorage.setItem(KEY, v ? "1" : "0");
    } catch {}
    listeners.forEach((l) => l());
  };
  return { visible, set };
}

export function SensitiveToggle() {
  const { visible, set } = useSensitiveVisible();
  return (
    <button
      onClick={() => set(!visible)}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong px-3 text-sm text-muted transition hover:text-fg"
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      {visible ? "hide sensitive" : "show sensitive"}
    </button>
  );
}
