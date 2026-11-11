import { cookies, headers } from "next/headers";
import { z } from "zod";
import { assertSameOrigin, handle, HttpError } from "@/lib/server/auth";
import { safeEqual } from "@/lib/server/crypto";
import { env } from "@/lib/server/env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/server/session-token";

const Body = z.object({ passphrase: z.string().min(1).max(256) });

// Simple in-process limiter: 6 attempts per 15 minutes per client address.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX = 6;

function limit(key: string) {
  const now = Date.now();
  const cur = attempts.get(key);
  if (!cur || cur.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  cur.count += 1;
  if (cur.count > MAX) throw new HttpError(429, "Too many attempts. Try again later.");
}

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOrigin();
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    limit(ip);

    const { passphrase } = Body.parse(await req.json());
    const expected = env().OWNER_PASSPHRASE;
    if (!expected || !env().SESSION_SECRET) {
      throw new HttpError(503, "Sign-in is not configured. Set OWNER_PASSPHRASE and SESSION_SECRET.");
    }
    if (!safeEqual(passphrase, expected)) {
      await new Promise((r) => setTimeout(r, 400));
      throw new HttpError(401, "That passphrase doesn't match.");
    }
    attempts.delete(ip);
    const token = await signSession();
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return Response.json({ ok: true });
  });
}
