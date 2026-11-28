import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EVENT_TYPES = new Set(["brand_deal","endorsement","public_appearance","news_mention","platform_metric","hashtag_observation","ownership_claim","trend_signal"]);
const ENTITY_TYPES = new Set(["person","creator","media_group","outlet","brand","organization","hashtag","topic"]);
const SOURCE_TYPES = new Set(["official_document","platform_api","brand_disclosure","creator_disclosure","news_report","research_report","public_profile","other"]);
const VERIFICATION = new Set(["verified","unverified","disputed","withdrawn"]);
const CONFIDENCE = new Set(["high","medium","low"]);
const REVIEW_METHODS = new Set(["manual_source_review","official_record_cross_check","authorized_platform_data","other"]);
const REVIEW_REQUIRED_STATES = new Set(["verified","disputed","withdrawn"]);
const RELATIONSHIPS = new Set(["sponsors","endorses","owns","controls","mentions","appears_with","other"]);
const RELATED_STATUS = new Set(["documented","claimed","unverified"]);
const EVENT_KEYS = new Set(["event_id","event_type","entity","claim","source","verification_status","confidence","observation_window","metric","related_entities","disclosure","review","provenance","notes"]);
const ENTITY_KEYS = new Set(["id","display_name","entity_type","canonical_url"]);
const SOURCE_KEYS = new Set(["publisher","url","source_type","published_at","captured_at"]);
const METRIC_KEYS = new Set(["name","value","unit","platform","scope","window_start","window_end"]);

function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function hasOnlyKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(path + "." + key + " is not an allowed field");
}
function isDateTime(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}
function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.protocol === "https:" && Boolean(url.hostname); }
  catch { return false; }
}
function requireString(value, path, errors, maxLength = 2000) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength)
    errors.push(path + " must be a non-empty string of at most " + maxLength + " characters");
}
function validateWindow(window, path, errors) {
  if (!isObject(window)) { errors.push(path + " must be an object"); return; }
  hasOnlyKeys(window, new Set(["start","end","timezone"]), path, errors);
  if (!isDateTime(window.start)) errors.push(path + ".start must be an ISO 8601 timestamp with timezone");
  if (!isDateTime(window.end)) errors.push(path + ".end must be an ISO 8601 timestamp with timezone");
  requireString(window.timezone, path + ".timezone", errors, 100);
  if (isDateTime(window.start) && isDateTime(window.end) && Date.parse(window.end) <= Date.parse(window.start))
    errors.push(path + ".end must be later than start");
}

export function validateEvent(event, index = 0) {
  const errors = [], path = "events[" + index + "]";
  if (!isObject(event)) return [path + " must be an object"];
  hasOnlyKeys(event, EVENT_KEYS, path, errors);
  for (const key of ["event_id","claim"]) if (!(key in event)) errors.push(path + "." + key + " is required");
  if (typeof event.event_id === "string" && !/^[a-z0-9][a-z0-9._-]{2,99}$/.test(event.event_id))
    errors.push(path + ".event_id must be a stable lowercase identifier (3–100 characters)");
  if (!EVENT_TYPES.has(event.event_type)) errors.push(path + ".event_type is unsupported");
  requireString(event.claim, path + ".claim", errors);

  if (!isObject(event.entity)) errors.push(path + ".entity must be an object");
  else {
    hasOnlyKeys(event.entity, ENTITY_KEYS, path + ".entity", errors);
    requireString(event.entity.id, path + ".entity.id", errors, 200);
    requireString(event.entity.display_name, path + ".entity.display_name", errors, 200);
    if (!ENTITY_TYPES.has(event.entity.entity_type)) errors.push(path + ".entity.entity_type is unsupported");
    if (event.entity.canonical_url !== undefined && !isHttpsUrl(event.entity.canonical_url))
      errors.push(path + ".entity.canonical_url must be an HTTPS URL");
  }

  if (!isObject(event.source)) errors.push(path + ".source must be an object");
  else {
    hasOnlyKeys(event.source, SOURCE_KEYS, path + ".source", errors);
    requireString(event.source.publisher, path + ".source.publisher", errors, 300);
    if (!isHttpsUrl(event.source.url)) errors.push(path + ".source.url must be an HTTPS URL");
    if (!SOURCE_TYPES.has(event.source.source_type)) errors.push(path + ".source.source_type is unsupported");
    if (!isDateTime(event.source.captured_at)) errors.push(path + ".source.captured_at must be an ISO 8601 timestamp with timezone");
    if (event.source.published_at !== undefined && !isDateTime(event.source.published_at))
      errors.push(path + ".source.published_at must be an ISO 8601 timestamp with timezone when supplied");
    const publicationRequired = ["brand_deal","endorsement","public_appearance","news_mention","ownership_claim"].includes(event.event_type);
    if (publicationRequired && event.source.published_at === undefined)
      errors.push(path + ".source.published_at is required to establish when this event was published");
    if (isDateTime(event.source.published_at) && isDateTime(event.source.captured_at) &&
        Date.parse(event.source.published_at) > Date.parse(event.source.captured_at))
      errors.push(path + ".source.published_at cannot be later than source.captured_at");
  }

  if (!VERIFICATION.has(event.verification_status)) errors.push(path + ".verification_status is unsupported");
  if (!CONFIDENCE.has(event.confidence)) errors.push(path + ".confidence is unsupported");

  if (REVIEW_REQUIRED_STATES.has(event.verification_status) && event.review === undefined)
    errors.push(path + ".review is required for " + event.verification_status + " events");
  if (event.review !== undefined) {
    if (!isObject(event.review)) errors.push(path + ".review must be an object");
    else {
      hasOnlyKeys(event.review, new Set(["reviewer_id","reviewed_at","method","decision_basis"]), path + ".review", errors);
      requireString(event.review.reviewer_id, path + ".review.reviewer_id", errors, 100);
      if (typeof event.review.reviewer_id === "string" && event.review.reviewer_id.trim().length < 3)
        errors.push(path + ".review.reviewer_id must contain at least 3 characters");
      if (!isDateTime(event.review.reviewed_at))
        errors.push(path + ".review.reviewed_at must be an ISO 8601 timestamp with timezone");
      if (!REVIEW_METHODS.has(event.review.method))
        errors.push(path + ".review.method is unsupported");
      requireString(event.review.decision_basis, path + ".review.decision_basis", errors, 1000);
      if (isObject(event.source) && isDateTime(event.source.captured_at) && isDateTime(event.review.reviewed_at) &&
          Date.parse(event.review.reviewed_at) < Date.parse(event.source.captured_at))
        errors.push(path + ".review.reviewed_at cannot be earlier than source.captured_at");
    }
  }
  if (event.provenance !== undefined) {
    const provenance = event.provenance;
    if (!isObject(provenance)) errors.push(path + ".provenance must be an object");
    else {
      hasOnlyKeys(provenance, new Set(["provider_id","queue_id","candidate_id","promotion_method"]), path + ".provenance", errors);
      if (provenance.provider_id !== "gdelt-doc-2") errors.push(path + ".provenance.provider_id must equal gdelt-doc-2");
      if (typeof provenance.queue_id !== "string" || !/^mrq_[a-f0-9]{24}$/.test(provenance.queue_id))
        errors.push(path + ".provenance.queue_id must be a valid media review queue ID");
      if (typeof provenance.candidate_id !== "string" || !/^mc_[a-f0-9]{24}$/.test(provenance.candidate_id))
        errors.push(path + ".provenance.candidate_id must be a valid media candidate ID");
      if (provenance.promotion_method !== "human_review_queue")
        errors.push(path + ".provenance.promotion_method must equal human_review_queue");
    }
  }
  if (event.observation_window !== undefined) {
    validateWindow(event.observation_window, path + ".observation_window", errors);
    if (isObject(event.observation_window) && isDateTime(event.observation_window.end) &&
        isObject(event.source) && isDateTime(event.source.captured_at) &&
        Date.parse(event.observation_window.end) > Date.parse(event.source.captured_at))
      errors.push(path + ".observation_window.end cannot be later than source.captured_at");
  }
  if (["platform_metric","hashtag_observation","trend_signal"].includes(event.event_type) && event.observation_window === undefined)
    errors.push(path + ".observation_window is required for this event type");
  if (event.event_type === "platform_metric" && event.metric === undefined)
    errors.push(path + ".metric is required for platform_metric events");

  if (event.metric !== undefined) {
    if (!isObject(event.metric)) errors.push(path + ".metric must be an object");
    else {
      hasOnlyKeys(event.metric, METRIC_KEYS, path + ".metric", errors);
      for (const key of ["name","unit","platform","scope"]) requireString(event.metric[key], path + ".metric." + key, errors, 300);
      if (typeof event.metric.value !== "number" || !Number.isFinite(event.metric.value))
        errors.push(path + ".metric.value must be a finite number");
      for (const key of ["window_start","window_end"])
        if (!isDateTime(event.metric[key])) errors.push(path + ".metric." + key + " must be an ISO 8601 timestamp with timezone");
      if (isDateTime(event.metric.window_start) && isDateTime(event.metric.window_end) &&
          Date.parse(event.metric.window_end) <= Date.parse(event.metric.window_start))
        errors.push(path + ".metric.window_end must be later than window_start");
      if (event.event_type === "platform_metric" && isObject(event.observation_window) &&
          isDateTime(event.metric.window_start) && isDateTime(event.metric.window_end) &&
          isDateTime(event.observation_window.start) && isDateTime(event.observation_window.end) &&
          (Date.parse(event.metric.window_start) !== Date.parse(event.observation_window.start) ||
           Date.parse(event.metric.window_end) !== Date.parse(event.observation_window.end)))
        errors.push(path + ".metric window must match the declared observation_window");
    }
  }

  if (event.related_entities !== undefined) {
    if (!Array.isArray(event.related_entities)) errors.push(path + ".related_entities must be an array");
    else event.related_entities.forEach((related, relatedIndex) => {
      const relatedPath = path + ".related_entities[" + relatedIndex + "]";
      if (!isObject(related)) { errors.push(relatedPath + " must be an object"); return; }
      hasOnlyKeys(related, new Set(["id","display_name","relationship","status"]), relatedPath, errors);
      requireString(related.id, relatedPath + ".id", errors, 200);
      requireString(related.display_name, relatedPath + ".display_name", errors, 200);
      if (!RELATIONSHIPS.has(related.relationship)) errors.push(relatedPath + ".relationship is unsupported");
      if (!RELATED_STATUS.has(related.status)) errors.push(relatedPath + ".status is unsupported");
    });
  }

  if (event.disclosure !== undefined) {
    if (!isObject(event.disclosure)) errors.push(path + ".disclosure must be an object");
    else {
      hasOnlyKeys(event.disclosure, new Set(["status","text"]), path + ".disclosure", errors);
      if (!new Set(["disclosed","not_disclosed","unclear","not_applicable"]).has(event.disclosure.status))
        errors.push(path + ".disclosure.status is unsupported");
      if (event.disclosure.text !== undefined) requireString(event.disclosure.text, path + ".disclosure.text", errors, 1000);
    }
  }
  if (event.notes !== undefined) requireString(event.notes, path + ".notes", errors, 3000);
  return errors;
}

export function validateLedger(ledger) {
  const errors = [];
  if (!isObject(ledger)) return ["ledger must be an object"];
  hasOnlyKeys(ledger, new Set(["schema_version","events"]), "ledger", errors);
  if (ledger.schema_version !== "1.0.0") errors.push("ledger.schema_version must equal 1.0.0");
  if (!Array.isArray(ledger.events)) { errors.push("ledger.events must be an array"); return errors; }
  const seen = new Set();
  const seenMediaCandidates = new Set();
  ledger.events.forEach((event, index) => {
    errors.push(...validateEvent(event, index));
    if (isObject(event) && typeof event.event_id === "string") {
      if (seen.has(event.event_id)) errors.push("duplicate event_id: " + event.event_id);
      seen.add(event.event_id);
    }
    const candidateId = isObject(event) && isObject(event.provenance) ? event.provenance.candidate_id : null;
    if (typeof candidateId === "string") {
      if (seenMediaCandidates.has(candidateId)) errors.push("duplicate promoted media candidate: " + candidateId);
      seenMediaCandidates.add(candidateId);
    }
  });
  return errors;
}

function runValidation() {
  let ledger;
  try { ledger = JSON.parse(readFileSync(resolve(process.cwd(), "data/evidence-events.json"), "utf8")); }
  catch (error) { console.error("Unable to read evidence ledger:", error.message); process.exitCode = 1; return; }
  const errors = validateLedger(ledger);
  if (errors.length) {
    console.error("EVIDENCE LEDGER VALIDATION FAILED");
    for (const error of errors) console.error(" - " + error);
    process.exitCode = 1;
    return;
  }
  console.log("EVIDENCE LEDGER VALIDATION PASSED — " + ledger.events.length + " events; " +
    ledger.events.filter(event => event.verification_status === "verified").length + " verified; " +
    ledger.events.filter(event => event.verification_status !== "verified").length + " unverified/disputed/withdrawn.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runValidation();
