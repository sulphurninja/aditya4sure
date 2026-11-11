import { describe, expect, it } from "vitest";
import { guessSelf } from "@/lib/importers/common";
import { fixText, parseInstagram, summarizeInstagramFiles } from "@/lib/importers/instagram";
import { detectDateOrder, parseWhatsApp, parseWhatsAppWithOrder, titleFromFileName } from "@/lib/importers/whatsapp";

const ANDROID = [
  "13/11/2026, 9:41 pm - Messages and calls are end-to-end encrypted. Only people in this chat can read them.",
  "13/11/2026, 9:41 pm - Aditya: hehe ok so 16th is locked?",
  "13/11/2026, 9:42 pm - Komal: yesss",
  "lunch then movie",
  "and NO staged decorations 😤",
  "13/11/2026, 9:42 pm - Aditya: <Media omitted>",
  "13/11/2026, 9:43 pm - Komal: This message was deleted",
  "13/11/2026, 9:44 pm - Aditya: ok ok <This message was edited>",
  "13/11/2026, 9:44 pm - Aditya: ok ok",
].join("\n");

const IOS = [
  "‎[1/2/26, 10:05:12 AM] Aditya Pingle: ykw man",
  "[1/2/26, 10:05:40 PM] Shubhodeep: ‎image omitted",
  "[25/2/26, 11:00:00 AM] Aditya Pingle: MRR update coming",
].join("\r\n");

describe("WhatsApp parser", () => {
  const t = parseWhatsApp(ANDROID, { fileName: "WhatsApp Chat with Komal.txt" });

  it("parses Android exports with multiline messages", () => {
    expect(t.title).toBe("Komal");
    const komal = t.messages.find((m) => m.sender === "Komal" && m.kind === "text")!;
    expect(komal.text).toBe("yesss\nlunch then movie\nand NO staged decorations 😤");
  });

  it("converts 12h IST times to UTC", () => {
    // 13 Nov 2026 21:41 IST == 16:11 UTC
    expect(t.messages[1].at).toBe("2026-11-13T16:11:00.000Z");
  });

  it("classifies system, media, deleted and edited messages", () => {
    expect(t.messages[0].kind).toBe("system");
    expect(t.messages.find((m) => m.text === "<Media omitted>")?.kind).toBe("media");
    expect(t.messages.find((m) => m.sender === "Komal" && m.kind === "deleted")).toBeTruthy();
    const edited = t.messages.filter((m) => m.sender === "Aditya" && m.text === "ok ok");
    expect(edited[0].edited).toBe(true);
  });

  it("gives identical same-minute messages distinct dup indices (idempotent re-import)", () => {
    const okok = t.messages.filter((m) => m.text === "ok ok");
    expect(okok.map((m) => m.dup)).toEqual([0, 1]);
    expect(parseWhatsApp(ANDROID).messages.map((m) => m.dup)).toEqual(t.messages.map((m) => m.dup));
  });

  it("lists participants by activity, excluding system", () => {
    expect(t.participants).toEqual(["Aditya", "Komal"]);
  });

  it("parses iOS exports with invisible marks and narrow spaces", () => {
    const i = parseWhatsApp(IOS);
    expect(i.messages).toHaveLength(3);
    expect(i.messages[0].sender).toBe("Aditya Pingle");
    expect(i.messages[1].kind).toBe("media");
    expect(i.dateOrder).toBe("DMY"); // 25/2 proves day-first
    expect(i.messages[2].at.startsWith("2026-02-25")).toBe(true);
  });

  it("detects month-first exports and flags ambiguity", () => {
    expect(detectDateOrder([{ a: 2, b: 25, c: 26 }]).order).toBe("MDY");
    expect(detectDateOrder([{ a: 2, b: 5, c: 26 }]).ambiguous).toBe(true);
  });

  it("lets the user flip an ambiguous date order", () => {
    const amb = "1/2/26, 10:05 - A: hi\n1/2/26, 10:06 - B: yo";
    expect(parseWhatsApp(amb).messages[0].at.startsWith("2026-02-01")).toBe(true);
    expect(parseWhatsAppWithOrder(amb, "MDY").messages[0].at.startsWith("2026-01-02")).toBe(true);
  });

  it("returns a helpful warning for non-WhatsApp files", () => {
    expect(parseWhatsApp("hello world").warnings[0]).toMatch(/No WhatsApp messages/);
  });

  it("derives titles from export file names", () => {
    expect(titleFromFileName("WhatsApp Chat - Shubhodeep.zip")).toBe("Shubhodeep");
    expect(titleFromFileName("_chat.txt")).toBeNull();
  });
});

describe("Instagram parser", () => {
  const mojibake = "Komal ð\u009f\u0092\u009c"; // "Komal 💜" double-encoded
  const file = JSON.stringify({
    participants: [{ name: "Komal" }, { name: "Aditya Pingle" }],
    title: "Komal",
    messages: [
      { sender_name: "Komal", timestamp_ms: 1762500000000, content: mojibake },
      { sender_name: "Aditya Pingle", timestamp_ms: 1762400000000, content: "low light, high standards" },
      { sender_name: "Aditya Pingle", timestamp_ms: 1762450000000, photos: [{ uri: "x.jpg" }] },
      { sender_name: "Komal", timestamp_ms: 1762460000000, content: "Komal unsent a message", is_unsent: true },
    ],
  });

  it("repairs Instagram's double-encoded UTF-8", () => {
    expect(fixText(mojibake)).toBe("Komal 💜");
    expect(fixText("already fine ✓")).toBe("already fine ✓");
  });

  it("parses, sorts chronologically and classifies messages", () => {
    const t = parseInstagram([file]);
    expect(t.source).toBe("instagram");
    expect(t.messages[0].text).toBe("low light, high standards");
    expect(t.messages[1].kind).toBe("media");
    expect(t.messages[2].kind).toBe("deleted");
    expect(t.messages[3].text).toBe("Komal 💜");
    expect(t.participants).toContain("Aditya Pingle");
  });

  it("summarizes conversations found in a full export", () => {
    const files = new Map([
      ["your_instagram_activity/messages/inbox/komal_123/message_1.json", file],
      ["your_instagram_activity/messages/inbox/komal_123/message_2.json", file],
      ["your_instagram_activity/media/posts.json", "{}"],
    ]);
    const s = summarizeInstagramFiles(files);
    expect(s).toHaveLength(1);
    expect(s[0].count).toBe(8);
    expect(s[0].files).toHaveLength(2);
  });
});

describe("self detection", () => {
  it("matches the owner's name variants", () => {
    expect(guessSelf(["Komal", "Aditya Pingle"], ["Aditya", "Aditya Pingle"])).toBe("Aditya Pingle");
    expect(guessSelf(["Komal", "Adi"], ["Aditya Pingle"])).toBeNull();
  });
});
