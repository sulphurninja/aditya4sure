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
    pathname === "/api/reminders/tick" || pathname.startsWith("/api/public/voice/");
  if (isPublic) return NextResponse.next();

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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
