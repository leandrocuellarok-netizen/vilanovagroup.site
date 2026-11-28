import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeArticleUrl } from "./gdelt-doc-adapter.mjs";
import { validateEvent, validateLedger } from "./validate-evidence-ledger.mjs";

const STEP_IDS = Object.freeze([
  "publisher_identity_and_original_page",
  "publication_timestamp",
  "claim_and_article_context",
  "cross_source_duplicate_story_check",
  "copyright_and_attribution_check",
  "human_reviewer_decision"
]);
const DECISIONS = new Set(["verified", "unverified", "disputed", "withdrawn"]);
const ENTITY_TYPES = new Set(["person", "creator", "media_group", "outlet", "brand", "organization", "hashtag", "topic"]);
const METHODS = new Set(["manual_source_review", "official_record_cross_check", "authorized_platform_data", "other"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function timestamp(value, label) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new TypeError(label + " must be an ISO 8601 timestamp with timezone.");
  }
  return Date.parse(value);
}

function requiredText(value, label, maximum = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new TypeError(label + " must be a non-empty string of at most " + maximum + " characters.");
  }
  return value.trim();
}

function httpsUrl(value, label) {
  if (typeof value !== "string") throw new TypeError(label + " must be an HTTPS URL.");
  let url;
  try { url = new URL(value); } catch { throw new TypeError(label + " must be an HTTPS URL."); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new TypeError(label + " must be an HTTPS URL without embedded credentials.");
  }
  return url.toString();
}

function validateQueueAndCandidate(queue, candidateId) {
  if (!isObject(queue) || queue.schema_version !== "1.0.0" ||
      queue.provider_id !== "gdelt-doc-2" || queue.queue_status !== "awaiting_human_review" ||
      queue.ledger_imported !== false || !/^mrq_[a-f0-9]{24}$/.test(queue.queue_id || "") ||
      !Array.isArray(queue.candidates)) {
    throw new TypeError("A valid, unimported GDELT media review queue is required.");
  }
  const candidate = queue.candidates.find(item => item && item.candidate_id === candidateId);
  if (!candidate) throw new TypeError("The requested candidate_id does not exist in the supplied queue.");
  if (!/^mc_[a-f0-9]{24}$/.test(candidate.candidate_id) ||
      candidate.review_status !== "unreviewed" ||
      candidate.evidence_class !== "news_discovery_candidate" ||
      candidate.publication_at !== null ||
      !isObject(candidate.review) || candidate.review.status !== "pending" ||
      !Array.isArray(candidate.review.steps) ||
      candidate.review.steps.some(step => !isObject(step) || step.status !== "pending")) {
    throw new TypeError("Only an untouched, unreviewed discovery candidate can be promoted.");
  }
  const canonical = canonicalizeArticleUrl(candidate.source_url);
  const storedCanonical = canonicalizeArticleUrl(candidate.canonical_url);
  if (!canonical || canonical !== storedCanonical || storedCanonical !== candidate.canonical_url) {
    throw new TypeError("The candidate must retain a matching safe source_url and canonical_url.");
  }
  httpsUrl(candidate.canonical_url, "candidate.canonical_url");
  const domain = new URL(candidate.canonical_url).hostname.toLowerCase();
  if (candidate.source_domain !== domain) throw new TypeError("candidate.source_domain must match the canonical source URL.");
  const capturedAt = timestamp(candidate.captured_at, "candidate.captured_at");
  if (candidate.captured_at !== queue.provider_retrieved_at) {
    throw new TypeError("candidate.captured_at must match queue.provider_retrieved_at.");
  }
  return { candidate, capturedAt };
}

export function buildReviewedMediaEvidenceEvent(queue, decision) {
  if (!isObject(decision)) throw new TypeError("A separate human adjudication record is required.");
  const candidateId = requiredText(decision.candidate_id, "candidate_id", 100);
  const { candidate, capturedAt } = validateQueueAndCandidate(queue, candidateId);
  if (decision.queue_id !== queue.queue_id) throw new TypeError("decision.queue_id must match the supplied queue.");
  const eventId = requiredText(decision.event_id, "event_id", 100);
  if (!/^[a-z0-9][a-z0-9._-]{2,99}$/.test(eventId)) throw new TypeError("event_id must be a stable lowercase identifier.");
  if (!DECISIONS.has(decision.decision)) throw new TypeError("decision must be verified, unverified, disputed or withdrawn.");
  if (!CONFIDENCE.has(decision.confidence)) throw new TypeError("confidence must be high, medium or low.");
  if (!METHODS.has(decision.method)) throw new TypeError("method is not an approved evidence review method.");

  const reviewerId = requiredText(decision.reviewer_id, "reviewer_id", 100);
  if (reviewerId.length < 3) throw new TypeError("reviewer_id must contain at least three characters.");
  const reviewedAt = timestamp(decision.reviewed_at, "reviewed_at");
  if (reviewedAt < capturedAt) throw new TypeError("reviewed_at cannot predate the candidate capture time.");
  const publicationAt = timestamp(decision.publication_at, "publication_at");
  if (publicationAt > capturedAt) throw new TypeError("publication_at cannot be later than the candidate capture time.");

  const basis = requiredText(decision.decision_basis, "decision_basis", 1000);
  const claim = requiredText(decision.claim, "claim", 2000);
  const publisher = requiredText(decision.publisher, "publisher", 300);
  if (!isObject(decision.entity)) throw new TypeError("entity must be an explicitly reviewed object.");
  const entity = {
    id: requiredText(decision.entity.id, "entity.id", 200),
    display_name: requiredText(decision.entity.display_name, "entity.display_name", 200),
    entity_type: decision.entity.entity_type
  };
  if (!ENTITY_TYPES.has(entity.entity_type)) throw new TypeError("entity.entity_type is unsupported.");
  if (decision.entity.canonical_url !== undefined) {
    entity.canonical_url = httpsUrl(decision.entity.canonical_url, "entity.canonical_url");
  }

  if (!Array.isArray(decision.steps) || decision.steps.length !== STEP_IDS.length) {
    throw new TypeError("Exactly six completed review steps are required.");
  }
  decision.steps.forEach((step, index) => {
    if (!isObject(step) || step.step_id !== STEP_IDS[index] || step.status !== "completed") {
      throw new TypeError("All six review steps must be completed in the prescribed order.");
    }
    const checkedAt = timestamp(step.checked_at, "steps[" + index + "].checked_at");
    if (checkedAt < capturedAt || checkedAt > reviewedAt) {
      throw new TypeError("Every review step timestamp must fall between candidate capture and final review.");
    }
    httpsUrl(step.evidence_url, "steps[" + index + "].evidence_url");
    requiredText(step.notes, "steps[" + index + "].notes", 500);
  });

  const event = {
    event_id: eventId,
    event_type: "news_mention",
    entity,
    claim,
    source: {
      publisher,
      url: candidate.canonical_url,
      source_type: "news_report",
      published_at: decision.publication_at,
      captured_at: candidate.captured_at
    },
    verification_status: decision.decision,
    confidence: decision.confidence,
    review: {
      reviewer_id: reviewerId,
      reviewed_at: decision.reviewed_at,
      method: decision.method,
      decision_basis: basis
    },
    provenance: {
      provider_id: "gdelt-doc-2",
      queue_id: queue.queue_id,
      candidate_id: candidate.candidate_id,
      promotion_method: "human_review_queue"
    },
    notes: "Promoted from a human-reviewed media discovery candidate. Queue and candidate IDs are retained in provenance."
  };

  const errors = validateEvent(event);
  if (errors.length) throw new TypeError("The proposed Evidence Ledger event is invalid: " + errors.join("; "));
  return event;
}

export function promoteReviewedMediaCandidate(ledger, queue, decision) {
  const ledgerErrors = validateLedger(ledger);
  if (ledgerErrors.length) throw new TypeError("The existing Evidence Ledger is invalid: " + ledgerErrors.join("; "));
  const event = buildReviewedMediaEvidenceEvent(queue, decision);
  if (ledger.events.some(item => item.event_id === event.event_id)) {
    throw new TypeError("The event_id already exists in the Evidence Ledger.");
  }
  if (ledger.events.some(item => item.provenance?.candidate_id === event.provenance.candidate_id)) {
    throw new TypeError("This media review candidate has already been promoted.");
  }
  const updated = { schema_version: ledger.schema_version, events: [...ledger.events, event] };
  const errors = validateLedger(updated);
  if (errors.length) throw new TypeError("The resulting Evidence Ledger is invalid: " + errors.join("; "));
  return updated;
}

function runCli(args) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log("Usage: node scripts/promote-reviewed-media-candidate.mjs <queue.json> <decision.json> <ledger.json> <new-ledger.json>");
    return;
  }
  if (args.length !== 4) {
    throw new Error("Expected queue, human decision, existing ledger and new ledger output paths. Use --help for usage.");
  }
  const [queuePath, decisionPath, ledgerPath, outputPath] = args.map(value => resolve(value));
  if (new Set([queuePath, decisionPath, ledgerPath, outputPath]).size !== 4) {
    throw new Error("Input and output paths must all be different.");
  }
  if (existsSync(outputPath)) throw new Error("Output path already exists; refusing to overwrite any file.");
  const queue = JSON.parse(readFileSync(queuePath, "utf8"));
  const decision = JSON.parse(readFileSync(decisionPath, "utf8"));
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const updated = promoteReviewedMediaCandidate(ledger, queue, decision);
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = outputPath + ".tmp-" + process.pid;
  try {
    writeFileSync(temporaryPath, JSON.stringify(updated, null, 2) + "\n", { flag: "wx" });
    renameSync(temporaryPath, outputPath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
  console.log("MEDIA EVIDENCE PROMOTED — 1 reviewed news event appended; queue and original ledger preserved; no network request made.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { runCli(process.argv.slice(2)); }
  catch (error) {
    console.error("MEDIA EVIDENCE PROMOTION ERROR — " + error.message);
    process.exitCode = 1;
  }
}
