import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateMediaOwnershipRegistry } from "./validate-media-ownership-registry.mjs";

const registry = JSON.parse(readFileSync(resolve("data/argentina-media-ownership.json"), "utf8"));
assert.deepEqual(validateMediaOwnershipRegistry(registry), [], "The published first-edition register must validate.");

const telefe = registry.entities.find(entity => entity.entity_id === "telefe");
assert.equal(telefe.ownership_status, "unresolved", "Telefe current ownership must remain unresolved while later reports conflict.");
const gelatina = registry.entities.find(entity => entity.entity_id === "gelatina");
assert.equal(gelatina.ownership_status, "unresolved", "Gelatina ownership must not be inferred without primary documentation.");

const boardClaim = registry.claims.find(claim => claim.claim_id === "america-tv-board-2026");
assert.equal(boardClaim.claim_kind, "governance", "Board appointments must remain governance claims.");
assert.match(boardClaim.inference_guard, /do not establish shareholding/i);

const historicalClaim = registry.claims.find(claim => claim.claim_id === "la-nacion-historical-ownership-2018");
assert.equal(historicalClaim.status, "historical_snapshot_only", "The 2018 La Nación ownership snapshot must not be represented as current.");

const clone = value => structuredClone(value);
let candidate = clone(registry);
candidate.sources[0].url = "http://insecure.example.test";
assert.ok(validateMediaOwnershipRegistry(candidate).some(error => error.includes("HTTPS")), "HTTP source URLs must be rejected.");

candidate = clone(registry);
candidate.claims[0].source_ids = ["missing-source"];
assert.ok(validateMediaOwnershipRegistry(candidate).some(error => error.includes("unknown source_id")), "Unknown source references must be rejected.");

candidate = clone(registry);
candidate.claims.find(claim => claim.claim_id === "america-reported-cap-table-2026").status = "primary_source_confirmed";
assert.ok(validateMediaOwnershipRegistry(candidate).some(error => error.includes("requires an official")), "A secondary report must not be promoted to primary-confirmed.");

candidate = clone(registry);
candidate.claims.find(claim => claim.claim_id === "america-tv-board-2026").inference_guard = "";
assert.ok(validateMediaOwnershipRegistry(candidate).some(error => error.includes("do not establish shareholding")), "Governance claims must not imply ownership.");

candidate = clone(registry);
candidate.claims.find(claim => claim.claim_id === "la-nacion-historical-ownership-2018").status = "primary_source_confirmed";
assert.ok(validateMediaOwnershipRegistry(candidate).some(error => error.includes("requires an official")), "A historical research snapshot must not become a current primary-confirmed claim.");

candidate = clone(registry);
candidate.claims.find(claim => claim.claim_id === "telefe-later-sale-report-2026").source_ids = ["src-telefe-lpo-2026"];
assert.ok(validateMediaOwnershipRegistry(candidate).some(error => error.includes("at least two retrievable sources")), "Disputed claims must retain at least two sources.");

candidate = clone(registry);
candidate.entities.push(clone(candidate.entities[0]));
assert.ok(validateMediaOwnershipRegistry(candidate).some(error => error.includes("duplicate or missing entity_id")), "Duplicate entity IDs must be rejected.");

candidate = clone(registry);
candidate.claims.find(claim => claim.claim_id === "blender-reported-control-2025").subject_entity_id = "unknown-outlet";
assert.ok(validateMediaOwnershipRegistry(candidate).some(error => error.includes("unknown subject_entity_id")), "Claims for unknown entities must be rejected.");

candidate = clone(registry);
candidate.entities.find(entity => entity.entity_id === "grupo-clarin").ownership_status = "reported_only";
assert.ok(validateMediaOwnershipRegistry(candidate).some(error => error.includes("reported_only status requires")), "Entity status must be supported by a matching claim class.");

console.log("MEDIA OWNERSHIP REGISTRY TESTS PASSED — source provenance, claim status, historical snapshots, governance/ownership separation, conflict retention, entity references and unresolved ownership safeguards.");
