import { describe, expect, it } from "vitest";
import { MoneyEntryInput, MoneyEntryPatch, MoneyGoalPatch } from "@/lib/domain";

describe("money schemas", () => {
  it("accepts a normal entry and defaults to done / app", () => {
    const e = MoneyEntryInput.parse({ kind: "expense", amount: "450", date: "2026-11-10", title: "uber" });
    expect(e).toMatchObject({ amount: 450, status: "done", via: "app" });
  });

  it("rejects nonsense", () => {
    expect(() => MoneyEntryInput.parse({ kind: "expense", amount: -5, date: "2026-11-10", title: "x" })).toThrow();
    expect(() => MoneyEntryInput.parse({ kind: "stolen", amount: 5, date: "2026-11-10", title: "x" })).toThrow();
    expect(() => MoneyEntryInput.parse({ kind: "income", amount: 5, date: "yesterday", title: "x" })).toThrow();
  });

  it("patches only touch the fields they name (no defaults sneaking in)", () => {
    expect(MoneyEntryPatch.parse({ status: "done" })).toEqual({ status: "done" });
    expect(MoneyGoalPatch.parse({ target: "2500000" })).toEqual({ target: 2500000 });
  });
});
