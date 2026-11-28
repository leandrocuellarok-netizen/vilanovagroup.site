import assert from "node:assert/strict";
import { auditProfileDirectory, exportReviewQueueCsv } from "./audit-influencer-freshness.mjs";

const now = "2026-11-28T00:00:00-03:00";
const base = Date.parse(now);
const daysAgo = n => new Date(base - n * 86400000).toISOString();
const source = (slug, age, publisher = "Synthetic official source") => ({
  publisher, url: "https://example.org/" + slug, source_type: "official_site",
  published_at: daysAgo(age + 1), captured_at: daysAgo(age),
  claim_supported: "Synthetic test evidence only."
});
function profile({ id = "test-creator-001", status = "verified", reviewAge = 5, sourceAge = 5,
  displayName = "Synthetic Test Creator", publisher } = {}) {
  const proof = source(id, sourceAge, publisher);
  return {
    profile_id: id, display_name: displayName, category: "creator", country_code: "AR", status, aliases: [],
    public_profiles: [{ platform: "YouTube", handle: "@" + id, url: "https://youtube.com/@" + id,
      identity_status: status === "verified" ? "verified" : "claimed",
      verification_method: "cross_linked_official_site", source: proof }],
    evidence: [proof], created_at: daysAgo(300), updated_at: daysAgo(Math.min(reviewAge, 10)),
    last_reviewed_at: daysAgo(reviewAge)
  };
}
const wrap = profiles => ({ schema_version: "1.0.0", profiles });
const empty = auditProfileDirectory(wrap([]), { now });
assert.equal(empty.status, "empty_directory");
assert.equal(empty.summary.profiles_queued, 0);
const emptyCsv = exportReviewQueueCsv(empty);
assert.equal(emptyCsv.trimEnd().split("\r\n").length, 1, "Empty queue export must contain the header only");
assert.ok(emptyCsv.startsWith('"audit_generated_at","profile_id"'), "CSV headers must be stable and explicit");

const fresh = auditProfileDirectory(wrap([profile()]), { now });
assert.equal(fresh.status, "up_to_date");
assert.equal(fresh.queue.length, 0);
const provisional = auditProfileDirectory(wrap([profile({ id: "test-provisional", status: "provisional" })]), { now });
assert.equal(provisional.queue[0].issues[0].code, "identity_confirmation_required");
assert.equal(provisional.queue[0].priority, "high");
const stale = auditProfileDirectory(wrap([profile({ id: "test-stale", reviewAge: 120, sourceAge: 220 })]), { now });
assert.equal(stale.status, "review_required");
assert.ok(stale.queue[0].issues.some(x => x.code === "identity_reverification_due"));
const sourceIssue = stale.queue[0].issues.find(x => x.code === "source_recheck_due");
assert.equal(sourceIssue.sources.length, 1, "Same source attached in two places must be counted once");
assert.equal(sourceIssue.sources[0].age_days, 220);
const disputed = auditProfileDirectory(wrap([profile({ id: "test-disputed", status: "disputed" })]), { now });
assert.equal(disputed.queue[0].priority, "critical");
assert.ok(disputed.queue[0].issues.some(x => x.code === "dispute_resolution_required"));
assert.throws(() => auditProfileDirectory(wrap([]), { now, profileReviewDays: 0 }), /profileReviewDays/);
assert.throws(() => auditProfileDirectory(wrap([]), { now, sourceReviewDays: 4000 }), /sourceReviewDays/);
assert.throws(() => auditProfileDirectory({ schema_version: "1.0.0", profiles: [{ profile_id: "broken" }] }, { now }), /invalid profile directory/i);

const hostile = auditProfileDirectory(wrap([
  profile({ id: "test-hostile", status: "provisional", reviewAge: 120, sourceAge: 220,
    displayName: '=HYPERLINK("https://evil.example","open")', publisher: '=CMD("bad")' })
]), { now });
const csv = exportReviewQueueCsv(hostile);
const lines = csv.trimEnd().split("\r\n");
assert.equal(lines.length, 4, "One profile with two issues and one stale source should flatten to three data rows");
assert.ok(csv.includes('"\'=HYPERLINK(""https://evil.example"",""open"")"'),
  "Formula-like display names must be neutralized and quotes escaped");
assert.ok(csv.includes('"\'=CMD(""bad"")"'), "Formula-like publisher values must be neutralized");
assert.equal(exportReviewQueueCsv(hostile), csv, "The same report must export deterministically");

console.log("VILANOVA PROFILE FRESHNESS AUDIT TESTS PASSED — review states, source deduplication, policy validation, stable CSV headers, multi-issue flattening, formula-injection protection, quote escaping and deterministic export.");
