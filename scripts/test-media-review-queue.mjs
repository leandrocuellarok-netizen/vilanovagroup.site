import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildMediaReviewQueue } from "./build-media-review-queue.mjs";

const capturedAt = "2026-11-28T09:30:00.000Z";
const discovery = {
  provider_id: "gdelt-doc-2",
  query: '"Banco Central" sourcecountry:ARG sourcelang:Spanish',
  requested_timespan: "24h",
  requested_sort: "DateDesc",
  retrieved_at: capturedAt,
  result_count: 3,
  articles: [
    {
      title: "Central Bank charter reform — report A",
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
    },
    {
      title: "Central Bank charter reform — report B",
      source_url: "https://news.example.ar/politics/bcra?fbclid=tracking#story",
      canonical_url: "https://news.example.ar/politics/bcra",
      source_domain: "news.example.ar",
      language: "Spanish",
      source_country: "Argentina",
      provider_seen_at: "2026-11-28T09:25:00.000Z",
      publication_at: null,
      retrieved_at: capturedAt,
      review_status: "unreviewed",
      evidence_class: "news_discovery_candidate"
    },
    {
      title: "Economic activity report",
      source_url: "https://economy.example.ar/data/activity",
      canonical_url: "https://economy.example.ar/data/activity",
      source_domain: "economy.example.ar",
      language: "Spanish",
      source_country: "Argentina",
      provider_seen_at: null,
      publication_at: null,
      retrieved_at: capturedAt,
      review_status: "unreviewed",
      evidence_class: "news_discovery_candidate"
    }
  ]
};

const queue = buildMediaReviewQueue(discovery, { generatedAt: capturedAt });
assert.equal(queue.schema_version, "1.0.0");
assert.equal(queue.queue_status, "awaiting_human_review");
assert.equal(queue.source_result_count, 3);
assert.equal(queue.candidate_count, 2);
assert.equal(queue.duplicate_count, 1);
assert.equal(queue.ledger_imported, false);
assert.equal(queue.candidates[0].title, "Central Bank charter reform — report B", "The duplicate with the newest provider-seen timestamp must be retained deterministically.");
assert.equal(queue.candidates[0].publication_at, null, "Provider-seen time must never be promoted to publisher publication time.");
assert.equal(queue.candidates[0].review_status, "unreviewed");
assert.equal(queue.candidates[0].review.status, "pending");
assert.ok(queue.candidates[0].review.steps.every(step => step.status === "pending"));
assert.ok(!("verification_status" in queue.candidates[0]), "Discovery candidates must not acquire a verification status.");
assert.ok(!("confidence" in queue.candidates[0]), "Discovery candidates must not acquire a confidence score.");
assert.ok(!("event_id" in queue.candidates[0]), "Discovery candidates must not be represented as Evidence Ledger events.");

const reversed = buildMediaReviewQueue({ ...discovery, articles: [...discovery.articles].reverse() }, { generatedAt: capturedAt });
assert.equal(reversed.queue_id, queue.queue_id, "Queue identity must be stable for the same provider query and capture time.");
assert.deepEqual(reversed.candidates.map(item => item.candidate_id), queue.candidates.map(item => item.candidate_id), "Candidate identity and ordering must not depend on provider result order.");
assert.equal(buildMediaReviewQueue(discovery, { generatedAt: "2026-11-28T09:35:00.000Z" }).generated_at, "2026-11-28T09:35:00.000Z");

const rejects = (mutate, pattern) => {
  const altered = structuredClone(discovery);
  mutate(altered);
  assert.throws(() => buildMediaReviewQueue(altered, { generatedAt: capturedAt }), pattern);
};
rejects(value => { value.provider_id = "another-provider"; }, /Only gdelt-doc-2/);
rejects(value => { value.result_count = 2; }, /result_count/);
rejects(value => { value.articles[0].publication_at = "2026-11-28T09:10:00.000Z"; }, /publication_at must remain null/);
rejects(value => { value.articles[0].review_status = "verified"; }, /unreviewed news_discovery_candidate/);
rejects(value => { value.articles[0].provider_seen_at = "2026-11-28T09:31:00.000Z"; }, /later than retrieval/);
rejects(value => { value.articles[0].source_domain = "wrong.example"; }, /source_domain must match/);
rejects(value => { value.articles[0].source_url = "javascript:alert(1)"; }, /safe HTTP\(S\) URL/);
rejects(value => { value.articles[0].retrieved_at = "2026-11-28T09:29:00.000Z"; }, /must match the discovery capture/);
assert.throws(() => buildMediaReviewQueue(discovery, { generatedAt: "2026-11-28T09:29:59.000Z" }), /cannot precede/);

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "build-media-review-queue.mjs");
const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "vilanova-media-review-"));
try {
  const inputPath = resolve(temporaryDirectory, "discovery.json");
  const outputPath = resolve(temporaryDirectory, "nested", "queue.json");
  writeFileSync(inputPath, JSON.stringify(discovery), "utf8");
  const success = spawnSync(process.execPath, [scriptPath, inputPath, outputPath], { encoding: "utf8" });
  assert.equal(success.status, 0, success.stderr || success.stdout);
  const written = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(written.candidate_count, 2, "CLI must write the same validated queue as the library function.");
  assert.match(success.stdout, /no evidence imported/);
  const invalidUsage = spawnSync(process.execPath, [scriptPath, inputPath], { encoding: "utf8" });
  assert.equal(invalidUsage.status, 1, "CLI must reject missing output paths.");
  assert.match(invalidUsage.stderr, /Expected an input discovery JSON path/);
  const samePath = spawnSync(process.execPath, [scriptPath, inputPath, inputPath], { encoding: "utf8" });
  assert.equal(samePath.status, 1, "CLI must refuse to overwrite its source discovery file.");
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log("MEDIA REVIEW QUEUE TESTS PASSED — provenance preservation, stable IDs, deterministic duplicate resolution, pending human-review steps, no evidence promotion, input validation, CLI output and safe path handling.");
