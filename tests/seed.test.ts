import { describe, expect, it } from "vitest";
import { classify, mapConfidence, normalizeSeed } from "@/lib/seed/normalize";
import { detectEntities } from "@/lib/seed/registry";
import { fixtureSeed } from "./fixtures";

const byId = (id: string) => normalizeSeed(fixtureSeed).memories.find((m) => m.provenance.seedId === id)!;

describe("seed normalization", () => {
  it("is deterministic — same input gives same ids, hashes and checksum (idempotent re-import)", () => {
    const a = normalizeSeed(fixtureSeed);
    const b = normalizeSeed(structuredClone(fixtureSeed));
    expect(a.checksum).toBe(b.checksum);
    expect(a.memories.map((m) => [m._id, m.provenance.contentHash])).toEqual(b.memories.map((m) => [m._id, m.provenance.contentHash]));
  });

  it("changes the content hash when a fact's text changes", () => {
    const edited = structuredClone(fixtureSeed);
    edited.facts[0].statement = "Date of birth: 16 March 2002.";
    const h1 = normalizeSeed(fixtureSeed).memories[0].provenance.contentHash;
    const h2 = normalizeSeed(edited).memories[0].provenance.contentHash;
    expect(h1).not.toBe(h2);
  });

  it("skips duplicate fact ids instead of creating duplicates", () => {
    const dup = structuredClone(fixtureSeed);
    dup.facts.push({ ...dup.facts[0] });
    const out = normalizeSeed(dup);
    expect(out.memories.filter((m) => m.provenance.seedId === "f0002")).toHaveLength(1);
    expect(out.issues.some((i) => i.id === "f0002")).toBe(true);
  });

  it("imports everything as pending review with every fact keeping provenance", () => {
    for (const m of normalizeSeed(fixtureSeed).memories) {
      expect(m.reviewStatus).toBe("pending");
      expect(m.sources[0].kind).toBe("seed");
      expect(m.sources[0].ref).toContain(m.provenance.seedId!);
    }
  });

  it("discounts confidence for assistant-written summaries", () => {
    expect(mapConfidence(fixtureSeed.facts[0] as never)).toBeLessThan(0.9);
  });

  it("marks historical metrics as dated snapshots, never current", () => {
    const mrr = byId("f0030");
    expect(mrr.temporal).toBe("snapshot");
    expect(mrr.type).toBe("metric");
    expect(mrr.eventAt).toBe("2026-02-01");
    expect(mrr.entityIds).toContain("project:zaptick");
  });

  it("treats future as_of as a planned event date, not an observation date", () => {
    const plan = byId("f0064");
    expect(plan.temporal).toBe("plan");
    expect(plan.eventAt).toBe("2026-11-16");
    expect(plan.observedAt).toBe("2026-11-10");
    expect(plan.validFrom).toBeNull();
  });

  it("merges the known duplicate f0092 into f0064 and keeps it sensitive", () => {
    const dupe = byId("f0092");
    expect(dupe.status).toBe("merged");
    expect(dupe.mergedInto).toBe("seed:f0064");
    expect(dupe.sensitivity).toBe("sensitive");
  });

  it("flags the inconsistent height/weight fact for review", () => {
    expect(byId("f0070").reviewNotes.join(" ")).toMatch(/173 cm/);
  });

  it("keeps mother's facts on her own subject, never Aditya", () => {
    const m = byId("f0068");
    expect(m.subjectId).toBe("person:mother");
    expect(m.sensitivity).toBe("sensitive");
  });

  it("defaults non-sensitive facts to private, and health/relationships to sensitive", () => {
    expect(byId("f0002").sensitivity).toBe("private");
    expect(byId("f0058").sensitivity).toBe("sensitive");
  });

  it("classifies stated preferences as stable style facts", () => {
    expect(classify(fixtureSeed.facts[6] as never)).toEqual({ type: "style", temporal: "stable" });
  });
});

describe("entity detection", () => {
  it("matches aliases on word boundaries, case-insensitively", () => {
    expect(detectEntities("How is ZapTick doing vs Ocean Linux?")).toEqual(expect.arrayContaining(["project:zaptick", "project:ocean-linux"]));
    expect(detectEntities("komal said hi")).toContain("person:komal");
  });

  it("does not match aliases inside other words", () => {
    expect(detectEntities("rackets and backticks")).toEqual([]);
  });
});
