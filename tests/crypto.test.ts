import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("encryption at rest", () => {
  it("round-trips and never stores plaintext", async () => {
    const { encrypt, decrypt } = await import("@/lib/server/crypto");
    const secret = "refresh-token-abc / private whatsapp text";
    const ct = encrypt(secret);
    expect(ct).not.toContain("whatsapp");
    expect(ct.startsWith("v1.")).toBe(true);
    expect(decrypt(ct)).toBe(secret);
  });

  it("rejects tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("@/lib/server/crypto");
    const parts = encrypt("hello").split(".");
    parts[3] = Buffer.from("tampered!!").toString("base64");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("compares secrets in constant time and correctly", async () => {
    const { safeEqual } = await import("@/lib/server/crypto");
    expect(safeEqual("pulse-orbit", "pulse-orbit")).toBe(true);
    expect(safeEqual("pulse-orbit", "pulse-orbiT")).toBe(false);
  });
});

describe("session tokens", () => {
  it("verifies its own tokens and rejects forged ones", async () => {
    process.env.SESSION_SECRET = randomBytes(48).toString("base64");
    const { signSession, verifySession } = await import("@/lib/server/session-token");
    const token = await signSession();
    expect(await verifySession(token)).toBe(true);
    expect(await verifySession(token.slice(0, -4) + "AAAA")).toBe(false);
    expect(await verifySession(undefined)).toBe(false);
  });
});
