import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateEvent, validateLedger } from "./validate-evidence-ledger.mjs";

const emptyLedger = JSON.parse(readFileSync("data/evidence-events.json", "utf8"));
assert.deepEqual(validateLedger(emptyLedger), [], "The intentionally empty initial ledger must be valid");

const validDisclosure = {
  event_id: "brand-deal-001",
  event_type: "brand_deal",
  entity: { id: "creator-placeholder", display_name: "Test Creator", entity_type: "creator" },
  claim: "A hypothetical test fixture for a publicly disclosed brand collaboration.",
  source: { publisher: "Example Publisher", url: "https://example.org/disclosure", source_type: "brand_disclosure",
    published_at: "2026-11-27T10:00:00-03:00", captured_at: "2026-11-27T10:05:00-03:00" },
  verification_status: "verified",
  confidence: "high",
  review: {
    reviewer_id: "synthetic-reviewer",
    reviewed_at: "2026-11-27T10:06:00-03:00",
    method: "manual_source_review",
    decision_basis: "Synthetic fixture reviewed against its synthetic source."
  },
  related_entities: [{ id: "brand-placeholder", display_name: "Test Brand", relationship: "sponsors", status: "documented" }],
  disclosure: { status: "disclosed", text: "Synthetic test fixture only." }
};
assert.deepEqual(validateEvent(validDisclosure), [], "A well-formed disclosure event must pass");

const missingReview = structuredClone(validDisclosure);
delete missingReview.review;
assert.ok(validateEvent(missingReview).some(error => error.includes(".review is required")),
  "A verified event without an attributable review record must be rejected");

const reviewBeforeCapture = structuredClone(validDisclosure);
reviewBeforeCapture.review.reviewed_at = "2026-11-27T10:04:00-03:00";
assert.ok(validateEvent(reviewBeforeCapture).some(error => error.includes("reviewed_at cannot be earlier than source.captured_at")),
  "A review cannot predate the evidence capture it assesses");

const disputedWithoutReview = structuredClone(validDisclosure);
disputedWithoutReview.verification_status = "disputed";
delete disputedWithoutReview.review;
assert.ok(validateEvent(disputedWithoutReview).some(error => error.includes(".review is required")),
  "A disputed adjudication must retain reviewer provenance");

const validMetric = {
  event_id: "platform-metric-001",
  event_type: "platform_metric",
  entity: { id: "channel-placeholder", display_name: "Test Channel", entity_type: "outlet" },
  claim: "A synthetic metric fixture used only to test units and observation windows.",
  source: { publisher: "Platform API", url: "https://example.org/metrics", source_type: "platform_api",
    captured_at: "2026-11-27T12:00:00-03:00" },
  verification_status: "unverified",
  confidence: "medium",
  observation_window: { start: "2026-11-26T12:00:00-03:00", end: "2026-11-27T12:00:00-03:00",
    timezone: "America/Argentina/Buenos_Aires" },
  metric: { name: "views", value: 12345, unit: "views", platform: "Example Platform", scope: "channel_total",
    window_start: "2026-11-26T12:00:00-03:00", window_end: "2026-11-27T12:00:00-03:00" }
};
assert.deepEqual(validateEvent(validMetric), [], "A complete platform metric must pass");

const undatedCommercialEvent = structuredClone(validDisclosure);
delete undatedCommercialEvent.source.published_at;
assert.ok(validateEvent(undatedCommercialEvent).some(error => error.includes("published_at is required")),
  "Commercial and public-event records without a publication date must be rejected");

const publicationAfterCapture = structuredClone(validDisclosure);
publicationAfterCapture.source.published_at = "2026-11-27T10:10:00-03:00";
publicationAfterCapture.source.captured_at = "2026-11-27T10:05:00-03:00";
assert.ok(validateEvent(publicationAfterCapture).some(error => error.includes("published_at cannot be later than source.captured_at")),
  "A source cannot be captured before its stated publication time");

const observationAfterCapture = structuredClone(validMetric);
observationAfterCapture.observation_window.end = "2026-11-27T12:05:00-03:00";
observationAfterCapture.metric.window_end = "2026-11-27T12:05:00-03:00";
assert.ok(validateEvent(observationAfterCapture).some(error => error.includes("observation_window.end cannot be later than source.captured_at")),
  "An observed metric window cannot end after the evidence capture timestamp");

const invalidHttpSource = structuredClone(validDisclosure);
invalidHttpSource.source.url = "http://example.org/not-secure";
assert.ok(validateEvent(invalidHttpSource).some(error => error.includes("must be an HTTPS URL")),
  "HTTP evidence sources must be rejected");

const missingMetric = structuredClone(validMetric);
delete missingMetric.metric;
assert.ok(validateEvent(missingMetric).some(error => error.includes("metric is required")),
  "Platform metrics without a metric object must be rejected");

const reversedWindow = structuredClone(validMetric);
reversedWindow.metric.window_start = "2026-11-27T12:00:00-03:00";
reversedWindow.metric.window_end = "2026-11-26T12:00:00-03:00";
assert.ok(validateEvent(reversedWindow).some(error => error.includes("later than window_start")),
  "Reversed metric windows must be rejected");

const missingTrendWindow = {
  event_id: "trend-001", event_type: "trend_signal",
  entity: { id: "topic-placeholder", display_name: "Test Topic", entity_type: "topic" },
  claim: "Synthetic trend test fixture.",
  source: { publisher: "Example Publisher", url: "https://example.org/trend", source_type: "news_report",
    captured_at: "2026-11-27T12:00:00-03:00" },
  verification_status: "unverified", confidence: "low"
};
assert.ok(validateEvent(missingTrendWindow).some(error => error.includes("observation_window is required")),
  "Trend observations without a declared window must be rejected");

const duplicateLedger = { schema_version: "1.0.0", events: [validDisclosure, structuredClone(validDisclosure)] };
assert.ok(validateLedger(duplicateLedger).some(error => error.includes("duplicate event_id")),
  "Duplicate event IDs must be rejected");

const provenanceEvent = structuredClone(validDisclosure);
provenanceEvent.event_id = "media-promotion-001";
provenanceEvent.provenance = {
  provider_id: "gdelt-doc-2",
  queue_id: "mrq_0123456789abcdef01234567",
  candidate_id: "mc_0123456789abcdef01234567",
  promotion_method: "human_review_queue"
};
assert.deepEqual(validateEvent(provenanceEvent), [], "A reviewed media event with valid discovery provenance must pass");

const invalidProvenance = structuredClone(provenanceEvent);
invalidProvenance.provenance.provider_id = "unapproved-provider";
assert.ok(validateEvent(invalidProvenance).some(error => error.includes("provenance.provider_id")),
  "A promoted media event must retain the approved discovery provider");

const duplicatePromotions = {
  schema_version: "1.0.0",
  events: [provenanceEvent, { ...structuredClone(provenanceEvent), event_id: "media-promotion-002" }]
};
assert.ok(validateLedger(duplicatePromotions).some(error => error.includes("duplicate promoted media candidate")),
  "A single discovery candidate must not be promoted into the ledger more than once");

console.log("VILANOVA EVIDENCE LEDGER TESTS PASSED — empty baseline, valid disclosure, valid metric, HTTPS enforcement, metric completeness, time-window ordering, mandatory publication dates, publication/capture chronology, observation/capture chronology, trend-window requirement, reviewer provenance, review chronology and duplicate-ID rejection.");
