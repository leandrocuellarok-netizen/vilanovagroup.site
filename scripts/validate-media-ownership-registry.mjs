import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PRIMARY_SOURCE_TYPES = new Set([
  "official_corporate_disclosure",
  "official_public_filing",
  "transaction_counsel_notice"
]);

const ALLOWED_STATUSES = new Set([
  "primary_source_confirmed",
  "reported_not_primary_confirmed",
  "disputed",
  "historical_snapshot_only"
]);

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
}

function isDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function validateMediaOwnershipRegistry(registry) {
  const errors = [];
  if (!registry || registry.schema_version !== "1.0.0") errors.push("schema_version must be 1.0.0");
  if (registry?.registry_id !== "argentina-media-ownership") errors.push("registry_id must be argentina-media-ownership");
  if (registry?.jurisdiction !== "AR") errors.push("jurisdiction must be AR");
  if (!isDateTime(registry?.reviewed_at)) errors.push("reviewed_at must be an ISO date-time");
  if (!Array.isArray(registry?.entities)) errors.push("entities must be an array");
  if (!Array.isArray(registry?.sources)) errors.push("sources must be an array");
  if (!Array.isArray(registry?.claims)) errors.push("claims must be an array");
  if (errors.length) return errors;

  const entityIds = new Set();
  for (const entity of registry.entities) {
    if (!entity.entity_id || entityIds.has(entity.entity_id)) errors.push("duplicate or missing entity_id: " + entity.entity_id);
    entityIds.add(entity.entity_id);
    if (!entity.display_name) errors.push("entity display_name is required: " + entity.entity_id);
    if (entity.official_url !== undefined && entity.official_url !== null && !/^https:\/\//i.test(entity.official_url)) {
      errors.push("official_url must use HTTPS: " + entity.entity_id);
    }
    if (!["documented", "reported_only", "partial", "disputed", "historical_only", "unresolved"].includes(entity.ownership_status)) {
      errors.push("invalid ownership_status: " + entity.entity_id);
    }
    if (typeof entity.current_status_note !== "string" || entity.current_status_note.length < 20) {
      errors.push("current_status_note must explain the current evidence boundary: " + entity.entity_id);
    }
  }

  const sourceById = new Map();
  for (const source of registry.sources) {
    if (!source.source_id || sourceById.has(source.source_id)) errors.push("duplicate or missing source_id: " + source.source_id);
    sourceById.set(source.source_id, source);
    if (!/^https:\/\//i.test(source.url || "")) errors.push("source URL must use HTTPS: " + source.source_id);
    if (!source.publisher || !source.title || !source.access_note) errors.push("source metadata is incomplete: " + source.source_id);
    if (!isDateTime(source.accessed_at)) errors.push("source accessed_at is invalid: " + source.source_id);
    if (source.published_at !== null && !isIsoDate(source.published_at)) errors.push("source published_at must be an ISO date or null: " + source.source_id);
    if (isDateTime(source.accessed_at) && isIsoDate(source.published_at) &&
        Date.parse(source.published_at + "T00:00:00Z") > Date.parse(source.accessed_at)) {
      errors.push("source publication date cannot be after access date: " + source.source_id);
    }
  }

  const claimIds = new Set();
  const claimsByEntity = new Map();
  for (const claim of registry.claims) {
    if (!claim.claim_id || claimIds.has(claim.claim_id)) errors.push("duplicate or missing claim_id: " + claim.claim_id);
    claimIds.add(claim.claim_id);
    if (!entityIds.has(claim.subject_entity_id)) errors.push("unknown subject_entity_id: " + claim.claim_id);
    if (!claimsByEntity.has(claim.subject_entity_id)) claimsByEntity.set(claim.subject_entity_id, []);
    claimsByEntity.get(claim.subject_entity_id).push(claim);
    if (!ALLOWED_STATUSES.has(claim.status)) errors.push("invalid claim status: " + claim.claim_id);
    if (claim.as_of !== null && !isIsoDate(claim.as_of)) errors.push("claim as_of must be an ISO date or null: " + claim.claim_id);
    if (isIsoDate(claim.as_of) && Date.parse(claim.as_of + "T00:00:00Z") > Date.parse(registry.reviewed_at)) {
      errors.push("claim as_of cannot be after registry review: " + claim.claim_id);
    }
    if (!Array.isArray(claim.source_ids) || claim.source_ids.length === 0) errors.push("claim requires at least one source: " + claim.claim_id);
    const claimSources = (claim.source_ids || []).map(id => sourceById.get(id)).filter(Boolean);
    for (const id of claim.source_ids || []) {
      if (!sourceById.has(id)) errors.push("claim references unknown source_id " + id + ": " + claim.claim_id);
    }

    if (claim.status === "primary_source_confirmed" &&
        !claimSources.some(source => PRIMARY_SOURCE_TYPES.has(source.source_type))) {
      errors.push("primary_source_confirmed requires an official, filing or transaction-counsel source: " + claim.claim_id);
    }
    if (claim.status === "reported_not_primary_confirmed" &&
        claimSources.some(source => PRIMARY_SOURCE_TYPES.has(source.source_type))) {
      errors.push("reported_not_primary_confirmed must not be used when a primary source is attached: " + claim.claim_id);
    }
    if (claim.status === "historical_snapshot_only" &&
        !claimSources.some(source => source.source_type === "research_database" && /2018/.test(source.access_note + " " + source.title))) {
      errors.push("historical_snapshot_only requires an explicitly dated historical research source: " + claim.claim_id);
    }
    if (claim.status === "disputed") {
      if (claimSources.length < 2) errors.push("disputed claims require at least two retrievable sources: " + claim.claim_id);
      if (typeof claim.dispute_basis !== "string" || claim.dispute_basis.length < 20) {
        errors.push("disputed claims require a documented dispute_basis: " + claim.claim_id);
      }
    }
    if (claim.claim_kind === "governance" &&
        (!claim.inference_guard || !/do not establish shareholding/i.test(claim.inference_guard))) {
      errors.push("governance claims must explicitly state that board roles do not establish shareholding: " + claim.claim_id);
    }
    if (claim.claim_kind === "governance" && claim.predicate !== "board_composition") {
      errors.push("governance claims must use board_composition: " + claim.claim_id);
    }
    if (claim.claim_kind !== "governance" && claim.predicate === "board_composition") {
      errors.push("board_composition must not be classified as ownership or control: " + claim.claim_id);
    }
    for (const conflictId of claim.conflicts_with || []) {
      if (!registry.claims.some(item => item.claim_id === conflictId)) {
        errors.push("conflicts_with references unknown claim_id " + conflictId + ": " + claim.claim_id);
      }
    }
  }

  for (const entity of registry.entities) {
    const claims = claimsByEntity.get(entity.entity_id) || [];
    if (entity.ownership_status === "documented" &&
        !claims.some(claim => ["ownership", "control"].includes(claim.claim_kind) && claim.status === "primary_source_confirmed")) {
      errors.push("documented ownership status requires a primary ownership/control claim: " + entity.entity_id);
    }
    if (entity.ownership_status === "reported_only" &&
        !claims.some(claim => ["ownership", "control"].includes(claim.claim_kind) && claim.status === "reported_not_primary_confirmed")) {
      errors.push("reported_only status requires a reported ownership/control claim: " + entity.entity_id);
    }
    if (entity.ownership_status === "historical_only" &&
        !claims.some(claim => claim.status === "historical_snapshot_only")) {
      errors.push("historical_only status requires a historical snapshot claim: " + entity.entity_id);
    }
    if (entity.ownership_status === "disputed" &&
        !claims.some(claim => claim.status === "disputed")) {
      errors.push("disputed status requires a disputed claim: " + entity.entity_id);
    }
  }

  return errors;
}

function run() {
  const registryPath = resolve(process.argv[2] || "data/argentina-media-ownership.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const errors = validateMediaOwnershipRegistry(registry);
  if (errors.length) {
    console.error("MEDIA OWNERSHIP REGISTRY INVALID");
    for (const error of errors) console.error("- " + error);
    process.exitCode = 1;
    return;
  }
  console.log("MEDIA OWNERSHIP REGISTRY VALID — " + registry.entities.length + " entities, " +
    registry.claims.length + " claims, " + registry.sources.length + " sources; reported, disputed and historical claims remain explicitly qualified.");
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) run();
