import { fixText } from "./instagram";

/**
 * Turns an Instagram "Download your information" (JSON) export into memory candidates:
 * profile + bio history, account creation, audience & content insights, social graph,
 * close friends, what you search/watch/open, locations Instagram associates with you,
 * topics you asked to see less of, and DM activity. Pure, runs in browser or node.
 *
 * Deliberately skipped: synced phone contacts (other people's numbers), autofill
 * (address/payment details), IPs, cookies, device IDs, blocked accounts.
 */

export type AccountFact = {
  key: string;
  statement: string;
  section: "identity" | "accounts" | "people" | "projects" | "creativity" | "timeline" | "tools" | "relationships" | "other";
  type: "identity" | "account" | "event" | "metric" | "preference" | "insight" | "relationship" | "habit";
  temporal: "stable" | "snapshot" | "period" | "unknown";
  eventAt: string | null;
  sensitivity: "normal" | "private" | "sensitive";
  isInferred: boolean;
  confidence: number;
  file: string;
  tags: string[];
};

/** Files the account builder reads. Contacts, autofill, device info, IP/cookie logs are never loaded. */
export const ACCOUNT_FILES = {
  test(name: string) {
    if (/synced_contacts|autofill_information|device_information|logout_activity|profile_activity|last_known_location|blocked_profiles/.test(name)) return false;
    return (
      /^(?:.*\/)?(personal_information|connections\/followers_and_following|logged_information|ads_information|preferences|apps_and_websites_off_of_instagram)\/.+\.json$/.test(name) ||
      /login_and_profile_creation\/(signup_details|login_activity)\.json$/.test(name) ||
      /(^|\/)media\/other\/[^/]+\.srt$/.test(name)
    );
  },
};

type Json = Record<string, unknown>;
type LV = { label?: string; value?: string; vec?: { value?: string }[]; dict?: unknown[]; title?: string; timestamp_value?: number; href?: string };

const day = (ts?: number | null) => (ts ? new Date(ts * (ts > 1e12 ? 1 : 1000)).toISOString().slice(0, 10) : null);
const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
const s = (v: unknown) => (typeof v === "string" ? fixText(v).trim() : "");
const list = (xs: string[], n = 12) => (xs.length > n ? `${xs.slice(0, n).join(", ")} and ${xs.length - n} more` : xs.join(", "));

function lvs(item: unknown): LV[] {
  return ((item as { label_values?: LV[] })?.label_values ?? []) as LV[];
}
function lv(item: unknown, label: string): LV | undefined {
  return lvs(item).find((x) => x.label === label);
}
function smd(item: unknown, key: string): { value?: string; timestamp?: number; href?: string } | undefined {
  return (item as { string_map_data?: Record<string, { value?: string; timestamp?: number; href?: string }> })?.string_map_data?.[key];
}
/** Deep-find every value under a given label (Meta nests "Owner → Username" etc.). */
function deepValues(node: unknown, label: string, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => deepValues(n, label, out));
  else if (node && typeof node === "object") {
    const o = node as LV & Json;
    if (o.label === label && typeof o.value === "string" && o.value) out.push(fixText(o.value));
    for (const v of Object.values(o)) if (v && typeof v === "object") deepValues(v, label, out);
  }
  return out;
}
function top(xs: string[], n: number) {
  const c = new Map<string, number>();
  for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
const pick = (files: Map<string, unknown>, suffix: string) => {
  for (const [k, v] of files) if (k.endsWith(suffix)) return v;
  return undefined;
};

export type DmSummary = { title: string; count: number; selfCount: number; firstAt: string | null; lastAt: string | null };

export function buildAccountFacts(files: Map<string, unknown>, opts: { exportedAt: string; dms?: DmSummary[] }): { facts: AccountFact[]; username: string | null; displayName: string | null } {
  const facts: AccountFact[] = [];
  const at = opts.exportedAt;
  const add = (f: Omit<AccountFact, "confidence" | "isInferred" | "tags"> & Partial<Pick<AccountFact, "confidence" | "isInferred" | "tags">>) =>
    facts.push({ confidence: 0.95, isInferred: false, tags: ["instagram"], ...f, statement: f.statement.replace(/ ?— ?/g, ", ") });

  // ---------- profile ----------
  let username: string | null = null;
  let displayName: string | null = null;
  const pi = pick(files, "personal_information/personal_information.json") as { profile_user?: unknown[] } | undefined;
  const prof = pi?.profile_user?.[0];
  if (prof) {
    username = s(smd(prof, "Username")?.value) || null;
    displayName = s(smd(prof, "Name")?.value) || null;
    const bio = s(smd(prof, "Bio")?.value);
    const site = s(smd(prof, "Website")?.value);
    const pronouns = s(smd(prof, "Pronouns")?.value);
    const music = s(smd(prof, "Music on profile")?.value);
    const priv = s(smd(prof, "Private Account")?.value);
    const parts = [
      username && `username @${username}`,
      displayName && `display name "${displayName}"`,
      pronouns && `pronouns ${pronouns}`,
      priv && `account is ${priv.toLowerCase() === "true" ? "private" : "public"}`,
    ].filter(Boolean);
    if (parts.length) add({ key: "profile", statement: `Aditya's Instagram profile (as of ${fmtDay(at)}): ${parts.join(", ")}.`, section: "accounts", type: "account", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "personal_information.json" });
    if (bio) add({ key: "bio", statement: `Aditya's current Instagram bio (as of ${fmtDay(at)}): "${bio}"${site ? `, with website ${site}` : ""}.`, section: "identity", type: "identity", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "personal_information.json" });
    if (music) add({ key: "profile-music", statement: `Song Aditya has pinned on his Instagram profile (as of ${fmtDay(at)}): ${music}.`, section: "creativity", type: "preference", temporal: "snapshot", eventAt: at, sensitivity: "normal", file: "personal_information.json" });
    const email = s(smd(prof, "Email")?.value);
    if (email) add({ key: "email", statement: `Email on Aditya's Instagram account: ${email}.`, section: "accounts", type: "account", temporal: "snapshot", eventAt: at, sensitivity: "sensitive", file: "personal_information.json" });
  }

  // bio history
  const pc = (pick(files, "profile_changes.json") as { profile_profile_change?: unknown[] } | undefined)?.profile_profile_change ?? [];
  pc.forEach((c, i) => {
    const field = s(smd(c, "Changed")?.value);
    const nv = s(smd(c, "New value")?.value);
    const when = day(smd(c, "Change date")?.timestamp);
    if (!field || !nv) return;
    const what = /bio/i.test(field) ? "bio" : /link/i.test(field) ? "profile links" : field.toLowerCase();
    add({ key: `profile-change-${when}-${i}`, statement: `On ${fmtDay(when)} Aditya changed his Instagram ${what} to: "${nv.slice(0, 300)}".`, section: "timeline", type: "event", temporal: "period", eventAt: when, sensitivity: "private", file: "profile_changes.json", tags: ["instagram", "bio"] });
  });

  // account creation
  const su = (pick(files, "signup_details.json") as { account_history_registration_info?: unknown[] } | undefined)?.account_history_registration_info?.[0];
  if (su) {
    const when = day(smd(su, "Time")?.timestamp);
    const device = s(smd(su, "Device")?.value);
    if (when) add({ key: "signup", statement: `Aditya created his Instagram account${s(smd(su, "Username")?.value) ? ` (signed up as "${s(smd(su, "Username")?.value)}")` : ""} on ${fmtDay(when)}${device ? `, from a ${device} device` : ""}.`, section: "timeline", type: "event", temporal: "period", eventAt: when, sensitivity: "private", file: "signup_details.json" });
  }

  // profile meta (first/last story, live)
  const ipi = pick(files, "instagram_profile_information.json");
  if (ipi) {
    const first = lv(ipi, "First story time");
    const live = s(lv(ipi, "Has shared live video")?.value);
    const firstDay = day(first?.timestamp_value ?? (Number(first?.value) || null));
    if (firstDay) add({ key: "first-story", statement: `Aditya posted his first Instagram story on ${fmtDay(firstDay)}.`, section: "timeline", type: "event", temporal: "period", eventAt: firstDay, sensitivity: "normal", file: "instagram_profile_information.json" });
    if (live) add({ key: "live", statement: `Aditya has ${/true|yes/i.test(live) ? "" : "never "}gone live on Instagram (as of ${fmtDay(at)}).`, section: "creativity", type: "insight", temporal: "snapshot", eventAt: at, sensitivity: "normal", file: "instagram_profile_information.json" });
  }

  // ---------- locations ----------
  const based = pick(files, "profile_based_in.json");
  if (based) {
    const loc = deepValues(based, "City").concat(deepValues(based, "Region"), deepValues(based, "Country")).filter(Boolean);
    const all = loc.length ? loc : lvs(based).flatMap((x) => ((x.dict ?? []) as LV[]).map((d) => s(d.value))).filter(Boolean);
    if (all.length) add({ key: "based-in", statement: `Instagram has Aditya's profile based in ${all.join(", ")} (as of ${fmtDay(at)}).`, section: "identity", type: "identity", temporal: "snapshot", eventAt: at, sensitivity: "sensitive", file: "profile_based_in.json" });
  }
  const loi = pick(files, "locations_of_interest.json");
  if (loi) {
    const places = (lv(loi, "Locations of interest")?.vec ?? []).map((v) => s(v.value)).filter(Boolean);
    if (places.length) add({ key: "locations-of-interest", statement: `Places Instagram associates with Aditya (inferred from activity, as of ${fmtDay(at)}): ${list(places)}.`, section: "identity", type: "insight", temporal: "snapshot", eventAt: at, sensitivity: "sensitive", isInferred: true, confidence: 0.55, file: "locations_of_interest.json" });
  }

  // ---------- social graph ----------
  const followers = ((pick(files, "followers_1.json") as unknown[]) ?? []).map((f) => s((f as { string_list_data?: { value?: string }[] }).string_list_data?.[0]?.value)).filter(Boolean);
  const followingRaw = (pick(files, "following.json") as { relationships_following?: { title?: string; string_list_data?: { value?: string; href?: string }[] }[] } | undefined)?.relationships_following ?? [];
  const following = followingRaw.map((f) => s(f.title) || s(f.string_list_data?.[0]?.value) || s(f.string_list_data?.[0]?.href?.split("/").filter(Boolean).pop())).filter(Boolean);
  if (followers.length || following.length) {
    const fset = new Set(followers.map((x) => x.toLowerCase()));
    const mutual = following.filter((x) => fset.has(x.toLowerCase())).length;
    add({ key: "graph-counts", statement: `As of ${fmtDay(at)} Aditya had ${followers.length} Instagram followers and followed ${following.length} accounts (${mutual} mutual).`, section: "accounts", type: "metric", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "followers_and_following" });
  }
  const cf = ((pick(files, "close_friends.json") as unknown[]) ?? []).map((x) => s(lv(x, "Name")?.value) || s(lv(x, "Username")?.value) || s(lv(x, "URL")?.value?.split("/").filter(Boolean).pop())).filter(Boolean);
  if (cf.length) add({ key: "close-friends", statement: `Aditya's Instagram Close Friends list has ${cf.length} people (as of ${fmtDay(at)}): ${list(cf, 120)}.`, section: "people", type: "relationship", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "close_friends.json", tags: ["instagram", "close-friends"] });

  // ---------- insights (creator stats) ----------
  const aud = (pick(files, "audience_insights.json") as { organic_insights_audience?: unknown[] } | undefined)?.organic_insights_audience?.[0];
  if (aud) {
    const range = s(smd(aud, "Date range")?.value);
    const bits = [
      smd(aud, "Overall followers")?.value && `${smd(aud, "Overall followers")!.value} followers`,
      smd(aud, "Follows")?.value && `+${smd(aud, "Follows")!.value} follows`,
      smd(aud, "Unfollows")?.value && `${smd(aud, "Unfollows")!.value} unfollows`,
      s(smd(aud, "Follower percentage by town/city")?.value) && `top cities ${s(smd(aud, "Follower percentage by town/city")?.value)}`,
      s(smd(aud, "Follower percentage by age for all genders")?.value) && `ages ${s(smd(aud, "Follower percentage by age for all genders")?.value)}`,
    ].filter(Boolean);
    if (bits.length) add({ key: "audience", statement: `Instagram audience insights${range ? ` (${range})` : ""}: ${bits.join("; ")}.`, section: "creativity", type: "metric", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "audience_insights.json" });
  }
  const reach = (pick(files, "profiles_reached.json") as { organic_insights_reach?: unknown[] } | undefined)?.organic_insights_reach?.[0];
  if (reach) {
    const range = s(smd(reach, "Date range")?.value);
    const bits = ["Accounts reached", "Impressions", "Profile visits", "External link taps"].map((k) => (smd(reach, k)?.value ? `${k.toLowerCase()} ${smd(reach, k)!.value}` : null)).filter(Boolean);
    if (bits.length) add({ key: "reach", statement: `Instagram reach${range ? ` (${range})` : ""}: ${bits.join(", ")}.`, section: "creativity", type: "metric", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "profiles_reached.json" });
  }
  const inter = (pick(files, "content_interactions.json") as { organic_insights_interactions?: unknown[] } | undefined)?.organic_insights_interactions?.[0];
  if (inter) {
    const range = s(smd(inter, "Date range")?.value);
    const bits = ["Content interactions", "Post interactions", "Story interactions", "Reels interactions"].map((k) => (smd(inter, k)?.value ? `${k.toLowerCase()} ${smd(inter, k)!.value}` : null)).filter(Boolean);
    if (bits.length) add({ key: "interactions", statement: `Instagram interactions${range ? ` (${range})` : ""}: ${bits.join(", ")}.`, section: "creativity", type: "metric", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "content_interactions.json" });
  }
  const reels = (pick(files, "reels.json") as { organic_insights_reels?: unknown[] } | undefined)?.organic_insights_reels ?? [];
  reels.forEach((r, i) => {
    const cap = s(smd(r, "Caption")?.value) || s((r as { media_map_data?: Record<string, { title?: string }> }).media_map_data?.["Media thumbnail"]?.title);
    const when = day(smd(r, "Upload timestamp")?.timestamp) ?? day((r as { media_map_data?: Record<string, { creation_timestamp?: number }> }).media_map_data?.["Media thumbnail"]?.creation_timestamp);
    const stats = ["Instagram plays", "Accounts reached", "Instagram likes", "Instagram comments", "Instagram shares", "Instagram saves"].map((k) => (smd(r, k)?.value ? `${smd(r, k)!.value} ${k.replace("Instagram ", "").toLowerCase()}` : null)).filter(Boolean);
    add({ key: `reel-${when}-${i}`, statement: `Aditya posted a reel${when ? ` on ${fmtDay(when)}` : ""}${cap ? ` captioned "${cap.slice(0, 200)}"` : ""}${stats.length ? `. Stats: ${stats.join(", ")}` : ""}.`, section: "creativity", type: "event", temporal: "snapshot", eventAt: when, sensitivity: "normal", file: "reels.json", tags: ["instagram", "reel"] });
  });
  const stories = (pick(files, "stories.json") as { organic_insights_stories?: unknown[] } | undefined)?.organic_insights_stories ?? [];
  if (stories.length) {
    const rows = stories
      .map((st) => {
        const mm = (st as { media_map_data?: Record<string, { title?: string; creation_timestamp?: number }> }).media_map_data?.["Media thumbnail"];
        return { when: day(smd(st, "Creation timestamp")?.timestamp ?? mm?.creation_timestamp), cap: s(mm?.title), reach: Number(smd(st, "Accounts reached")?.value) || 0, replies: Number(smd(st, "Replies")?.value) || 0 };
      })
      .filter((x) => x.when)
      .sort((a, b) => a.when!.localeCompare(b.when!));
    const best = [...rows].sort((a, b) => b.reach - a.reach).slice(0, 3);
    const avg = Math.round(rows.reduce((n, r) => n + r.reach, 0) / Math.max(1, rows.length));
    add({
      key: "stories-summary",
      statement: `Aditya posted ${rows.length} Instagram stories between ${fmtDay(rows[0]?.when ?? null)} and ${fmtDay(rows[rows.length - 1]?.when ?? null)}, averaging ${avg} accounts reached. Top stories by reach: ${best.map((b) => `${fmtDay(b.when)}${b.cap ? ` "${b.cap.slice(0, 60)}"` : ""} (${b.reach})`).join("; ")}.`,
      section: "creativity",
      type: "metric",
      temporal: "snapshot",
      eventAt: rows[rows.length - 1]?.when ?? at,
      sensitivity: "private",
      file: "stories.json",
    });
    for (const r of rows.filter((x) => x.cap)) add({ key: `story-${r.when}-${r.cap.slice(0, 20)}`, statement: `Instagram story on ${fmtDay(r.when)}: "${r.cap.slice(0, 200)}" (reached ${r.reach}${r.replies ? `, ${r.replies} replies` : ""}).`, section: "creativity", type: "event", temporal: "period", eventAt: r.when, sensitivity: "private", file: "stories.json", tags: ["instagram", "story"] });
  }

  // ---------- attention: searches, links, what you watch ----------
  const ps = (pick(files, "profile_searches.json") as { searches_user?: { title?: string; string_list_data?: { timestamp?: number }[] }[] } | undefined)?.searches_user ?? [];
  const ks = (pick(files, "word_or_phrase_searches.json") as { searches_keyword?: { string_map_data?: Record<string, { value?: string }> }[] } | undefined)?.searches_keyword ?? [];
  const rs = ((pick(files, "recent_searches.json") as unknown[]) ?? []).map((x) => s(lv(x, "Search query")?.value));
  const searched = [...ps.map((x) => s(x.title)), ...ks.map((x) => s(x.string_map_data?.Search?.value)), ...rs].filter(Boolean);
  if (searched.length) add({ key: "searches", statement: `Recent Instagram searches by Aditya (as of ${fmtDay(at)}): ${list([...new Set(searched)], 20)}.`, section: "other", type: "habit", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "recent_searches" });

  const links = ((pick(files, "link_history.json") as unknown[]) ?? []).map((x) => ({ url: s(lv(x, "Website link that you visited")?.value), title: s(lv(x, "Title of website page that you visited")?.value) }));
  if (links.length) {
    const domains = top(
      links.map((l) => {
        try {
          return new URL(l.url).hostname.replace(/^www\./, "");
        } catch {
          return "";
        }
      }),
      12,
    );
    add({ key: "links", statement: `Sites Aditya opened most from inside Instagram (${links.length} links, as of ${fmtDay(at)}): ${domains.map(([d, n]) => `${d} (${n})`).join(", ")}.`, section: "other", type: "habit", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "link_history.json" });
  }

  const watchedOwners = [...deepValues(pick(files, "videos_watched.json"), "Username"), ...deepValues(pick(files, "posts_viewed.json"), "Username")];
  const watchedTop = top(watchedOwners, 20);
  if (watchedTop.length) add({ key: "watched", statement: `Accounts whose posts and reels Aditya viewed most recently on Instagram: ${watchedTop.map(([u, n]) => `@${u} (${n})`).join(", ")}.`, section: "creativity", type: "habit", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "videos_watched + posts_viewed", tags: ["instagram", "interests"] });

  const tags = top([...deepValues(pick(files, "videos_watched.json"), "Hashtag"), ...deepValues(pick(files, "posts_viewed.json"), "Hashtag")].map((h) => h.replace(/^#/, "").toLowerCase()), 20);
  if (tags.length >= 3) add({ key: "hashtags", statement: `Hashtags on content Aditya watched most on Instagram: ${tags.map(([t]) => `#${t}`).join(", ")}.`, section: "creativity", type: "insight", temporal: "snapshot", eventAt: at, sensitivity: "private", isInferred: true, confidence: 0.7, file: "videos_watched", tags: ["instagram", "interests"] });

  const cats = (lv(pick(files, "other_categories_used_to_reach_you.json"), "Name")?.vec ?? []).map((v) => s(v.value)).filter(Boolean);
  if (cats.length) add({ key: "ad-categories", statement: `Interest categories Instagram/Meta assigns to Aditya for ads (Meta's inference, not his words): ${list(cats, 25)}.`, section: "other", type: "insight", temporal: "snapshot", eventAt: at, sensitivity: "private", isInferred: true, confidence: 0.45, file: "other_categories_used_to_reach_you.json" });

  const less = deepValues(pick(files, "see_less_topics.json"), "Name").concat(((pick(files, "see_less_topics.json") as unknown[]) ?? []).flatMap((x) => lvs(x).flatMap((l) => (l.vec ?? []).map((v) => s(v.value))))).filter(Boolean);
  if (less.length) add({ key: "see-less", statement: `Topics Aditya told Instagram to show him less of: ${list([...new Set(less)], 20)}.`, section: "other", type: "preference", temporal: "stable", eventAt: at, sensitivity: "normal", file: "see_less_topics.json" });

  const adv = lvs(pick(files, "advertisers_using_your_activity_or_information.json")).reduce((n, x) => n + (x.vec?.length ?? 0), 0);
  if (adv) add({ key: "advertisers", statement: `${adv.toLocaleString("en-IN")} advertisers had used Aditya's activity or info to target him on Instagram (as of ${fmtDay(at)}).`, section: "other", type: "metric", temporal: "snapshot", eventAt: at, sensitivity: "normal", file: "advertisers_using_your_activity_or_information.json" });

  const offMeta = ((pick(files, "your_activity_off_meta_technologies.json") as unknown[]) ?? []).map((x) => s((x as { title?: string }).title)).filter(Boolean);
  if (offMeta.length) add({ key: "off-meta", statement: `Apps and sites that shared Aditya's activity with Meta: ${list(offMeta, 25)}.`, section: "tools", type: "insight", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "your_activity_off_meta_technologies.json" });

  const logins = (pick(files, "login_activity.json") as { account_history_login_history?: unknown[] } | undefined)?.account_history_login_history ?? [];
  const devices = top(
    logins.map((l) => {
      const ua = s(smd(l, "User Agent")?.value);
      const m = /(iPhone\d+,\d+|iPad\d+,\d+|Android|Windows|Macintosh|Linux)/.exec(ua);
      return m ? m[1].replace(/^iPhone\d+,\d+$/, "iPhone").replace(/^Macintosh$/, "Mac") : "";
    }),
    5,
  );
  if (devices.length) add({ key: "devices", statement: `Devices Aditya logs into Instagram from (recent logins): ${devices.map(([d, n]) => `${d} (${n})`).join(", ")}.`, section: "tools", type: "habit", temporal: "snapshot", eventAt: at, sensitivity: "private", file: "login_activity.json" });

  // subtitles from his own videos
  for (const [path, v] of files) {
    if (!path.endsWith(".srt") || typeof v !== "string") continue;
    const text = v
      .split(/\r?\n/)
      .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 20) add({ key: `srt-${path.split("/").pop()}`, statement: `Spoken words / subtitles from one of Aditya's Instagram videos: "${text.slice(0, 900)}".`, section: "creativity", type: "insight", temporal: "unknown", eventAt: null, sensitivity: "private", file: path.split("/").pop()!, tags: ["instagram", "video"] });
  }

  // ---------- DM activity ----------
  const dms = (opts.dms ?? []).filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
  if (dms.length) {
    const total = dms.reduce((n, d) => n + d.count, 0);
    add({
      key: "dm-top",
      statement: `Aditya's most active Instagram DM conversations (export ${fmtDay(at)}, ${dms.length} chats, ${total.toLocaleString("en-IN")} messages): ${dms
        .slice(0, 15)
        .map((d) => `${d.title} (${d.count.toLocaleString("en-IN")}, ${fmtDay(d.firstAt)} to ${fmtDay(d.lastAt)})`)
        .join("; ")}.`,
      section: "people",
      type: "relationship",
      temporal: "snapshot",
      eventAt: at,
      sensitivity: "private",
      file: "messages/inbox",
      tags: ["instagram", "dm"],
    });
  }

  return { facts, username, displayName };
}
