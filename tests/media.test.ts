import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseInstagram } from "@/lib/importers/instagram";
import { findAttachment, mediaCaption, parseWhatsApp } from "@/lib/importers/whatsapp";
import { listZip, matchAttachment, mediaKind, readZipEntry, readZipText } from "@/lib/importers/zip";

const chat = [
  "13/11/2026, 9:41 pm - Aditya: look what I got you",
  "13/11/2026, 9:41 pm - Aditya: IMG-20261113-WA0004.jpg (file attached)",
  "the pink one hehe",
  "13/11/2026, 9:42 pm - Komal: PTT-20261113-WA0005.opus (file attached)",
  "13/11/2026, 9:43 pm - Komal: STK-20261113-WA0006.webp (file attached)",
  "13/11/2026, 9:44 pm - Aditya: VID-20261113-WA0007.mp4 (file attached)",
].join("\n");

const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(2000).fill(7), 0xff, 0xd9]);

function buildZip() {
  const bytes = zipSync(
    {
      "WhatsApp Chat with Komal.txt": strToU8(chat),
      "IMG-20261113-WA0004.jpg": [fakeJpeg, { level: 0 }],
      "PTT-20261113-WA0005.opus": new Uint8Array([1, 2, 3]),
      "STK-20261113-WA0006.webp": new Uint8Array([4, 5, 6]),
      "VID-20261113-WA0007.mp4": new Uint8Array(5000).fill(9),
    },
    { level: 6 },
  );
  return new Blob([bytes as BlobPart]);
}

describe("random-access zip reader", () => {
  it("lists entries and reads deflated + stored entries without loading the whole zip", async () => {
    const z = buildZip();
    const entries = await listZip(z);
    expect(entries.map((e) => e.name).sort()).toEqual(
      ["IMG-20261113-WA0004.jpg", "PTT-20261113-WA0005.opus", "STK-20261113-WA0006.webp", "VID-20261113-WA0007.mp4", "WhatsApp Chat with Komal.txt"].sort(),
    );
    const txt = entries.find((e) => e.name.endsWith(".txt"))!;
    expect(await readZipText(z, txt)).toBe(chat);
    const img = await readZipEntry(z, entries.find((e) => e.name.endsWith(".jpg"))!);
    expect(Array.from(img.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    expect(img.length).toBe(fakeJpeg.length);
  });

  it("rejects non-zip files", async () => {
    await expect(listZip(new Blob(["hello"]))).rejects.toThrow(/zip/);
  });
});

describe("attachments", () => {
  it("detects Android and iOS attachment markers and keeps captions", () => {
    expect(findAttachment("IMG-20261113-WA0004.jpg (file attached)\nthe pink one hehe")).toBe("IMG-20261113-WA0004.jpg");
    expect(findAttachment("‎<attached: 00000012-PHOTO-2026-11-13-21-41-05.jpg>")).toBe("00000012-PHOTO-2026-11-13-21-41-05.jpg");
    expect(findAttachment("just text")).toBeUndefined();
    expect(mediaCaption("IMG-20261113-WA0004.jpg (file attached)\nthe pink one hehe")).toBe("the pink one hehe");
  });

  it("links parsed WhatsApp media messages to their files", async () => {
    const t = parseWhatsApp(chat);
    const media = t.messages.filter((m) => m.kind === "media");
    expect(media.map((m) => m.attachment)).toEqual(["IMG-20261113-WA0004.jpg", "PTT-20261113-WA0005.opus", "STK-20261113-WA0006.webp", "VID-20261113-WA0007.mp4"]);
    const entries = await listZip(buildZip());
    expect(media.every((m) => matchAttachment(entries, m.attachment!))).toBe(true);
  });

  it("classifies media kinds by WhatsApp naming", () => {
    expect(mediaKind("IMG-20261113-WA0004.jpg")).toBe("image");
    expect(mediaKind("PTT-20261113-WA0005.opus")).toBe("audio");
    expect(mediaKind("STK-20261113-WA0006.webp")).toBe("sticker");
    expect(mediaKind("VID-20261113-WA0007.mp4")).toBe("video");
    expect(mediaKind("00000012-PHOTO-2026-11-13.jpg")).toBe("image");
  });

  it("keeps Instagram photo paths as attachments", () => {
    const t = parseInstagram([
      JSON.stringify({
        participants: [{ name: "Komal" }, { name: "Aditya Pingle" }],
        messages: [{ sender_name: "Komal", timestamp_ms: 1762500000000, photos: [{ uri: "your_instagram_activity/messages/inbox/komal_1/photos/123.jpg" }] }],
      }),
    ]);
    expect(t.messages[0].attachment).toBe("your_instagram_activity/messages/inbox/komal_1/photos/123.jpg");
    expect(matchAttachment([{ name: "your_instagram_activity/messages/inbox/komal_1/photos/123.jpg", method: 0, compSize: 1, size: 1, offset: 0 }], t.messages[0].attachment!)).toBeTruthy();
  });
});
