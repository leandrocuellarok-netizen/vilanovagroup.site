import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildMediaReviewQueue } from "./build-media-review-queue.mjs";
import { promoteReviewedMediaCandidate } from "./promote-reviewed-media-candidate.mjs";
import { validateLedger } from "./validate-evidence-ledger.mjs";

const capturedAt = "2026-11-28T09:30:00.000Z";
const discovery = {
  provider_id: "gdelt-doc-2",
  query: '"Banco Central" sourcecountry:ARG sourcelang:Spanish',
  requested_timespan: "24h",
  requested_sort: "DateDesc",
  retrieved_at: capturedAt,
  result_count: 1,
  articles: [{
    title: "Synthetic Central Bank charter reform report",
    source_url: "https://news.example.ar/politics/bcra?utm_source=mail",
    canonical_url: "https://news.example.ar/politics/bcra",
    source_domain: "news.example.ar",
    language: "Spanish",
    source_country: "Argentina",
    provider_seen_at: "2026-11-28T09:20:00.000Z",
    publication_at: null,
    retrieved_at: capturedAt,
    review_status: "unreviewed",
    evidence_class: "news_discovery_candidate"
  }]
};
const queue = buildMediaReviewQueue(discovery, { generatedAt: capturedAt });
const candidate = queue.candidates[0];
const stepIds = [
  "publisher_identity_and_original_page",
  "publication_timestamp",
  "claim_and_article_context",
  "cross_source_duplicate_story_check",
  "copyright_and_attribution_check",
  "human_reviewer_decision"
];
const decision = {
  queue_id: queue.queue_id,
  candidate_id: candidate.candidate_id,
  event_id: "media-news-mention-001",
  decision: "verified",
  reviewer_id: "synthetic-reviewer",
  reviewed_at: "2026-11-28T10:00:00.000Z",
  method: "manual_source_review",
  decision_basis: "Synthetic fixture only; the original publisher page and all review checks are represented by test data.",
  claim: "A synthetic test claim about a hypothetical article; not a statement about a real person or event.",
  publisher: "Example News",
  publication_at: "2026-11-28T09:10:00.000Z",
  confidence: "high",
  entity: { id: "topic-bcra", display_name: "Central Bank charter reform", entity_type: "topic" },
  steps: stepIds.map((step_id, index) => ({
    step_id,
    status: "completed",
    checked_at: "2026-11-28T09:" + String(35 + index).padStart(2, "0") + ":00.000Z",
    evidence_url: "https://news.example.ar/politics/bcra",
    notes: "Synthetic test evidence for review step " + (index + 1) + "."
  }))
};
const emptyLedger = { schema_version: "1.0.0", events: [] };
const promoted = promoteReviewedMediaCandidate(emptyLedger, queue, decision);
assert.equal(promoted.events.length, 1);
assert.equal(promoted.events[0].event_type, "news_mention");
assert.equal(promoted.events[0].verification_status, "verified");
assert.equal(promoted.events[0].source.published_at, decision.publication_at);
assert.equal(promoted.events[0].source.captured_at, candidate.captured_at);
assert.equal(promoted.events[0].provenance.queue_id, queue.queue_id);
assert.equal(promoted.events[0].provenance.candidate_id, candidate.candidate_id);
assert.deepEqual(validateLedger(promoted), []);
assert.equal(queue.ledger_imported, false, "Promotion must not mutate the original discovery queue.");
assert.equal(candidate.review_status, "unreviewed", "The discovery candidate remains immutable and unreviewed in its original file.");

function rejects(mutator, pattern) {
  const altered = structuredClone(decision);
  mutator(altered);
  assert.throws(() => promoteReviewedMediaCandidate(emptyLedger, queue, altered), pattern);
}
rejects(value => { value.steps.pop(); }, /Exactly six completed review steps/);
rejects(value => { value.steps[2].status = "pending"; }, /completed in the prescribed order/);
rejects(value => { value.steps[0].evidence_url = "javascript:alert(1)"; }, /HTTPS URL/);
rejects(value => { value.publication_at = "2026-11-28T09:31:00.000Z"; }, /later than the candidate capture/);
rejects(value => { value.reviewed_at = "2026-11-28T09:29:00.000Z"; }, /cannot predate/);
rejects(value => { value.queue_id = "mrq_ffffffffffffffffffffffff"; }, /must match the supplied queue/);
rejects(value => { value.reviewer_id = "x"; }, /at least three characters/);
rejects(value => { value.decision = "approved"; }, /decision must be/);

assert.throws(
  () => promoteReviewedMediaCandidate(promoted, queue, { ...decision, event_id: "media-news-mention-002" }),
  /already been promoted/,
  "The same queue candidate must not be imported twice."
);
const eventIdCollisionLedger = {
  schema_version: "1.0.0",
  events: [{
    ...structuredClone(promoted.events[0]),
    provenance: { ...promoted.events[0].provenance, candidate_id: "mc_abcdef0123456789abcdef01" }
  }]
};
assert.deepEqual(validateLedger(eventIdCollisionLedger), [], "The event-ID collision fixture must itself be valid.");
assert.throws(
  () => promoteReviewedMediaCandidate(eventIdCollisionLedger, queue, { ...decision, event_id: "media-news-mention-001" }),
  /event_id already exists/,
  "Existing event IDs must not be reused."
);

const unverified = promoteReviewedMediaCandidate(emptyLedger, queue, { ...decision, event_id: "media-news-mention-003", decision: "unverified", confidence: "low" });
assert.equal(unverified.events[0].verification_status, "unverified", "Human review may retain an explicitly unverified result.");
assert.deepEqual(validateLedger(unverified), []);

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "promote-reviewed-media-candidate.mjs");
const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "vilanova-media-promotion-"));
try {
  const queuePath = resolve(temporaryDirectory, "queue.json");
  const decisionPath = resolve(temporaryDirectory, "decision.json");
  const ledgerPath = resolve(temporaryDirectory, "ledger.json");
  const outputPath = resolve(temporaryDirectory, "output", "ledger.json");
  writeFileSync(queuePath, JSON.stringify(queue), "utf8");
  writeFileSync(decisionPath, JSON.stringify(decision), "utf8");
  writeFileSync(ledgerPath, JSON.stringify(emptyLedger), "utf8");
  const success = spawnSync(process.execPath, [scriptPath, queuePath, decisionPath, ledgerPath, outputPath], { encoding: "utf8" });
  assert.equal(success.status, 0, success.stderr || success.stdout);
  assert.equal(JSON.parse(readFileSync(outputPath, "utf8")).events.length, 1);
  assert.match(success.stdout, /queue and original ledger preserved/);
  const overwrite = spawnSync(process.execPath, [scriptPath, queuePath, decisionPath, ledgerPath, outputPath], { encoding: "utf8" });
  assert.equal(overwrite.status, 1, "CLI must refuse to overwrite an existing output.");
  assert.match(overwrite.stderr, /refusing to overwrite/);
  const sameInputOutput = spawnSync(process.execPath, [scriptPath, queuePath, decisionPath, ledgerPath, ledgerPath], { encoding: "utf8" });
  assert.equal(sameInputOutput.status, 1, "CLI must refuse to use an input path as its output.");
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log("MEDIA EVIDENCE PROMOTION TESTS PASSED — six-step human review, HTTPS evidence, source chronology, explicit decisions, reviewer provenance, candidate/event deduplication, immutable inputs and safe CLI output.");
