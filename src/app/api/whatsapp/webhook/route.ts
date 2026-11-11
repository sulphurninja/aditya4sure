import { after } from "next/server";
import { claimInbound, handleInbound, isOwner, verifyZaptick, type ZaptickEvent } from "@/lib/server/whatsapp-inbound";

export const maxDuration = 300;

/**
 * Zaptick -> ADITYA. Verifies the HMAC signature, answers 200 within Zaptick's 5s limit,
 * then does the real work after the response. Only Aditya's own number is ever handled.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 512_000) return new Response("too large", { status: 413 });
  if (!verifyZaptick(raw, req.headers.get("x-zaptick-signature"))) return new Response("invalid signature", { status: 401 });

  let evt: ZaptickEvent;
  try {
    evt = JSON.parse(raw) as ZaptickEvent;
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (evt.event !== "customer.message" || !isOwner(evt)) return Response.json({ ok: true, ignored: true });

  const id = String(evt.data?.message?.id ?? evt.data?.message?.whatsappMessageId ?? "");
  if (!id || !(await claimInbound(id))) return Response.json({ ok: true, duplicate: true });

  after(() => handleInbound(evt));
  return Response.json({ ok: true });
}
