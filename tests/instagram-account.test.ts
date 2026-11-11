import { describe, expect, it } from "vitest";
import { ACCOUNT_FILES, buildAccountFacts } from "@/lib/importers/instagram-account";

const files = new Map<string, unknown>([
  [
    "personal_information/personal_information/personal_information.json",
    { profile_user: [{ string_map_data: { Username: { value: "testuser" }, Name: { value: "Test Person â\u009a¡" }, Bio: { value: "building stuff" }, Website: { value: "https://x.io" } } }] },
  ],
  ["personal_information/personal_information/profile_changes.json", { profile_profile_change: [{ string_map_data: { Changed: { value: "Profile Bio Text" }, "New value": { value: "new bio — here" }, "Change date": { timestamp: 1767000000 } } }] }],
  ["connections/followers_and_following/followers_1.json", [{ string_list_data: [{ value: "a" }] }, { string_list_data: [{ value: "b" }] }]],
  ["connections/followers_and_following/following.json", { relationships_following: [{ title: "a" }, { title: "c" }] }],
  ["connections/followers_and_following/close_friends.json", [{ label_values: [{ label: "Name", value: "Komal" }] }]],
  ["ads_information/instagram_ads_and_businesses/other_categories_used_to_reach_you.json", { label_values: [{ label: "Name", vec: [{ value: "Tech" }, { value: "Rap" }] }] }],
]);

describe("instagram account facts", () => {
  const { facts, username, displayName } = buildAccountFacts(files, { exportedAt: "2026-11-10", dms: [{ title: "Komal", count: 100, selfCount: 50, firstAt: "2026-01-01", lastAt: "2026-11-09" }] });
  const byKey = (k: string) => facts.find((f) => f.key.startsWith(k))!;

  it("reads profile with fixed encoding", () => {
    expect(username).toBe("testuser");
    expect(displayName).toBe("Test Person ⚡");
    expect(byKey("bio").statement).toContain("building stuff");
  });

  it("dates bio changes and strips em dashes", () => {
    const ch = byKey("profile-change");
    expect(ch.eventAt).toMatch(/^2025-12-2/);
    expect(ch.statement).not.toContain("—");
  });

  it("counts followers, following and mutuals", () => {
    expect(byKey("graph-counts").statement).toContain("2 Instagram followers and followed 2 accounts (1 mutual)");
  });

  it("marks Meta's ad categories as inferred", () => {
    const f = byKey("ad-categories");
    expect(f.isInferred).toBe(true);
    expect(f.confidence).toBeLessThan(0.6);
  });

  it("summarises DM activity", () => {
    expect(byKey("dm-top").statement).toContain("Komal (100");
  });

  it("never loads contacts, autofill or device files", () => {
    expect(ACCOUNT_FILES.test("connections/contacts/synced_contacts.json")).toBe(false);
    expect(ACCOUNT_FILES.test("personal_information/autofill_information/autofill_information.json")).toBe(false);
    expect(ACCOUNT_FILES.test("personal_information/device_information/device_camera_effects_support.json")).toBe(false);
    expect(ACCOUNT_FILES.test("logged_information/past_instagram_insights/stories.json")).toBe(true);
    expect(ACCOUNT_FILES.test("security_and_login_information/login_and_profile_creation/signup_details.json")).toBe(true);
  });
});
