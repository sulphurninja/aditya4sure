import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-02-01" → "Feb 2026"; with day when not the 1st. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "undated";
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = MONTHS[Number(mo) - 1] ?? mo;
  return d && d !== "01" ? `${Number(d)} ${month} ${y}` : `${month} ${y}`;
}

export function relativeDays(iso: string, today = new Date()): number {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const t = new Date(today.toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}
