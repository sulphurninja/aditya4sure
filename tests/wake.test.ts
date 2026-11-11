import { describe, expect, it } from "vitest";
import { SLEEP, WAKE } from "@/components/voice/wake";

const rest = (t: string) => {
  const m = WAKE.exec(t);
  return m ? t.slice(m.index + m[0].length).trim() : null;
};

describe("wake phrase", () => {
  it("wakes on his phrases, however the browser spells them", () => {
    for (const t of ["yo wassup gang", "Yo what's up gang", "whats up gang", "wassuuup gang", "hey aditya", "Hey Jarvis", "ok aditya", "sup gang"]) {
      expect(WAKE.test(t), t).toBe(true);
    }
  });

  it("passes along whatever came after the wake phrase", () => {
    expect(rest("yo wassup gang what's on today")).toBe("what's on today");
    expect(rest("hey jarvis, remind me to call pranav at 3")).toBe("remind me to call pranav at 3");
    expect(rest("hey aditya")).toBe("");
  });

  it("ignores normal talk", () => {
    for (const t of ["what's up with zaptick pricing", "the gang went out", "hey can you check this", "aditya said that"]) {
      expect(WAKE.test(t), t).toBe(false);
    }
  });
});

describe("sleep phrase", () => {
  it("goes to sleep on goodbyes", () => {
    for (const t of ["bye", "Bye!", "ok bye man", "that's all", "thats it", "go to sleep", "stop listening", "thanks, that's all", "chal bye", "later dude"]) {
      expect(SLEEP.test(t), t).toBe(true);
    }
  });

  it("does not sleep when bye is part of a real request", () => {
    for (const t of ["say bye to komal for me", "that's all I needed to know about the flat, what about money", "remind me later about the call"]) {
      expect(SLEEP.test(t), t).toBe(false);
    }
  });
});
