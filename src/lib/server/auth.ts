import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { OWNER_ID } from "@/lib/domain";
import { SESSION_COOKIE, verifySession } from "./session-token";

/** For server components/pages: redirects to /login when not signed in. */
export async function requireOwnerPage(): Promise<string> {
  const jar = await cookies();
  if (!(await verifySession(jar.get(SESSION_COOKIE)?.value))) redirect("/login");
  return OWNER_ID;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * For route handlers. Ownership is derived from the session only, any client-supplied
 * ownerId is ignored. Mutating requests must come from our own origin (CSRF guard on
 * top of SameSite=Strict cookies).
 */
export async function requireOwnerApi(req: Request): Promise<string> {
  const jar = await cookies();
  if (!(await verifySession(jar.get(SESSION_COOKIE)?.value))) {
    throw new HttpError(401, "Not signed in");
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    await assertSameOrigin();
  }
  return OWNER_ID;
}

export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host) throw new HttpError(403, "Missing origin");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Bad origin");
  }
  if (originHost !== host) throw new HttpError(403, "Cross-origin request blocked");
}

/** Wrap a route handler body: consistent JSON errors, no stack/PII leaks. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    if (err && typeof err === "object" && "issues" in err) {
      return Response.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("[api] unhandled error:", err instanceof Error ? err.message : "unknown");
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
