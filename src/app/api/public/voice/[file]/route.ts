import { getBlob } from "@/lib/server/blob-store";
import { verifyVoiceToken } from "@/lib/server/whatsapp";

/**
 * The only public file route: a reminder voice note for WhatsApp to fetch.
 * Needs a valid HMAC signature and expires after 24h; ids are random, nothing is listable.
 */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = file.replace(/\.mp3$/, "");
  const u = new URL(req.url);
  if (!verifyVoiceToken(id, Number(u.searchParams.get("e")), u.searchParams.get("s") ?? "")) return new Response("not found", { status: 404 });
  const audio = await getBlob("voice", id);
  if (!audio) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600", "Content-Length": String(audio.length) } });
}
