import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/server/session-token";

/**
 * First line of defense: unauthenticated requests never reach private pages or APIs.
 * Every route handler and page re-checks the session (defense in depth).
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // /api/mcp authenticates Claude with its own secret token inside the route.
  const isPublic = pathname === "/login" || pathname.startsWith("/api/auth/") || pathname === "/api/mcp" || pathname.startsWith("/api/mcp/") ||
    // Scheduler tick (own secret) and signed, expiring voice-note links for WhatsApp.
    pathname === "/api/reminders/tick" || pathname.startsWith("/api/public/voice/") ||
    // Zaptick webhook (HMAC-signed, verified in the route).
    pathname === "/api/whatsapp/webhook";
  if (isPublic) return NextResponse.next();

  // Server-to-server: the WhatsApp handler calls the chat brain with the app's own secret (re-checked in the route).
  if (pathname === "/api/chat" && sameSecret(req.headers.get("x-internal-secret"), process.env.MCP_TOKEN)) return NextResponse.next();

  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => false);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

/** Constant-time compare (proxy can't import the server crypto helpers). */
function sameSecret(a: string | null, b: string | undefined) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
