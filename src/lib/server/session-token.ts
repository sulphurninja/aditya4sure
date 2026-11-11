/**
 * Session token sign/verify. Kept free of Node-only APIs so proxy.ts can import it.
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "aditya_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not configured");
  return new TextEncoder().encode(s);
}

export async function signSession(): Promise<string> {
  return new SignJWT({ role: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuedAt()
    .setAudience("aditya-brain")
    .setIssuer("aditya-brain")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      audience: "aditya-brain",
      issuer: "aditya-brain",
      algorithms: ["HS256"],
    });
    return payload.sub === "owner" && payload.role === "owner";
  } catch {
    return false;
  }
}
