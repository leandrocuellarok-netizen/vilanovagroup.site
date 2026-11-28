import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateProfileDirectory } from "./validate-influencer-profiles.mjs";

const DAY = 86400000;
const PRIORITY = { critical: 0, high: 1, normal: 2 };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
function ageDays(timestamp, now) { return Math.floor((now - Date.parse(timestamp)) / DAY); }
function sourceKey(source) {
  try {
    const url = new URL(source.url);
    url.search = "";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "") + "|" + source.captured_at;
  } catch { return String(source.url) + "|" + source.captured_at; }
}
function sourcesFor(profile) {
  const list = [
    ...(Array.isArray(profile.evidence) ? profile.evidence : []),
    ...(Array.isArray(profile.public_profiles) ? profile.public_profiles.map(item => item?.source) : [])
  ].filter(object);
  const seen = new Set();
  return list.filter(source => {
    const key = sourceKey(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Timestamp-only review queue. It does not fetch external URLs or re-verify identities. */
export function auditProfileDirectory(directory, options = {}) {
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  if (!Number.isFinite(now)) throw new Error("options.now must be a valid date");
  const profileReviewDays = options.profileReviewDays ?? 90;
  const sourceReviewDays = options.sourceReviewDays ?? 180;
  for (const [name, value] of [["profileReviewDays", profileReviewDays], ["sourceReviewDays", sourceReviewDays]]) {
    if (!Number.isInteger(value) || value < 1 || value > 3650)
      throw new Error(name + " must be an integer between 1 and 3650");
  }
  const errors = validateProfileDirectory(directory, { now: new Date(now).toISOString() });
  if (errors.length) throw new Error("Cannot audit an invalid profile directory: " + errors.join("; "));

  const queue = [];
  let profileReviewsDue = 0, sourceRechecksDue = 0, provisional = 0, disputed = 0;
  for (const profile of directory.profiles) {
    const issues = [];
    const reviewAge = ageDays(profile.last_reviewed_at, now);
    if (profile.status === "provisional") {
      provisional++;
      issues.push({ code: "identity_confirmation_required", priority: "high",
        detail: "Confirm the public identity through an official cross-link, platform verification signal or official publication." });
    }
    if (profile.status === "disputed") {
      disputed++;
      issues.push({ code: "dispute_resolution_required", priority: "critical",
        detail: "Keep this attribution out of verified outputs until the identity conflict is resolved." });
    }
    if (reviewAge >= profileReviewDays) {
      profileReviewsDue++;
      issues.push({ code: profile.status === "verified" ? "identity_reverification_due" : "profile_review_due",
        priority: profile.status === "verified" ? "high" : "normal",
        age_days: reviewAge, threshold_days: profileReviewDays,
        detail: "The stored profile review date exceeds the configured review cadence." });
    }
    const staleSources = sourcesFor(profile).map(source => ({
      publisher: source.publisher, url: source.url, captured_at: source.captured_at,
      age_days: ageDays(source.captured_at, now)
    })).filter(source => source.age_days >= sourceReviewDays)
      .sort((a, b) => b.age_days - a.age_days);
    if (staleSources.length) {
      sourceRechecksDue += staleSources.length;
      issues.push({ code: "source_recheck_due", priority: "normal",
        threshold_days: sourceReviewDays, sources: staleSources,
        detail: "Stored captures exceed the source-review cadence. Re-open each source and verify that it still supports the recorded claim; this audit does not fetch URLs." });
    }
    if (issues.length) {
      const priority = issues.some(x => x.priority === "critical") ? "critical"
        : issues.some(x => x.priority === "high") ? "high" : "normal";
      queue.push({ profile_id: profile.profile_id, display_name: profile.display_name,
        category: profile.category, status: profile.status, last_reviewed_at: profile.last_reviewed_at,
        review_age_days: reviewAge, priority, issues });
    }
  }
  queue.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] ||
    b.review_age_days - a.review_age_days || a.display_name.localeCompare(b.display_name, "en"));
  return {
    generated_at: new Date(now).toISOString(),
    status: directory.profiles.length === 0 ? "empty_directory" : queue.length ? "review_required" : "up_to_date",
    policy: {
      profile_review_days: profileReviewDays, source_review_days: sourceReviewDays,
      basis: "Proposed operational cadence, not a legal requirement or platform rule.",
      limitations: "Timestamp-only audit. No external URL is fetched, no platform account is queried, and no identity or metric is independently re-verified."
    },
    summary: { profiles_total: directory.profiles.length, profiles_queued: queue.length,
      provisional_profiles: provisional, disputed_profiles: disputed,
      profile_reviews_due: profileReviewsDue, source_rechecks_due: sourceRechecksDue },
    queue
  };
}
function run() {
  try {
    const directory = JSON.parse(readFileSync(resolve(process.cwd(), "data/influencer-profiles.json"), "utf8"));
    const report = auditProfileDirectory(directory);
    if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else {
      console.log("VILANOVA PROFILE REVIEW AUDIT — " + report.status.toUpperCase());
      console.log("Profiles: " + report.summary.profiles_total + " | Queued: " + report.summary.profiles_queued +
        " | Profile reviews due: " + report.summary.profile_reviews_due + " | Source rechecks due: " + report.summary.source_rechecks_due);
      for (const item of report.queue) {
        console.log("[" + item.priority.toUpperCase() + "] " + item.display_name + " (" + item.profile_id + ")");
        for (const issue of item.issues) console.log(" - " + issue.code + ": " + issue.detail);
      }
      console.log("LIMITATION: " + report.policy.limitations);
    }
  } catch (error) { console.error("PROFILE REVIEW AUDIT FAILED:", error.message); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run();
