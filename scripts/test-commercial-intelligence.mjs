import assert from "node:assert/strict";
import {
  buildCommercialIntelligence,
  exportCommercialIntelligenceCsv
} from "./build-commercial-intelligence.mjs";

const now = new Date("2026-11-28T03:00:00.000Z");
const iso = hoursAgo => new Date(now.getTime() - hoursAgo * 3600000).toISOString();

function event({
  id,
  type = "brand_deal",
  personId = "creator-001",
  personName = "Synthetic Test Creator",
  entityType = "creator",
  verification = "verified",
  confidence = "high",
  related = [],
  hoursAgo = 3,
  publisher = "Synthetic Evidence Publisher",
  disclosure = { status: "disclosed", text: "Synthetic test disclosure only." }
}) {
  return {
    event_id: id,
    event_type: type,
    entity: { id: personId, display_name: personName, entity_type: entityType },
    claim: "Synthetic fixture for automated tests only.",
    source: {
      publisher,
      url: "https://example.org/evidence/" + id,
      source_type: type === "brand_deal" ? "brand_disclosure" : "creator_disclosure",
      published_at: iso(hoursAgo),
      captured_at: iso(hoursAgo - 0.1)
    },
    verification_status: verification,
    confidence,
    related_entities: related,
    disclosure
  };
}

function verifiedProfile() {
  const source = {
    publisher: "Synthetic Official Site",
    url: "https://example.org/creator",
    source_type: "official_site",
    published_at: iso(24),
    captured_at: iso(23.9),
    claim_supported: "Synthetic test source cross-links the public creator channel."
  };
  return {
    profile_id: "creator-001",
    display_name: "Synthetic Test Creator",
    category: "creator",
    country_code: "AR",
    status: "verified",
    aliases: ["Synthetic Creator"],
    public_profiles: [{
      platform: "YouTube",
      handle: "@synthetic-test",
      url: "https://youtube.com/@synthetic-test",
      identity_status: "verified",
      verification_method: "cross_linked_official_site",
      source
    }],
    evidence: [source],
    created_at: iso(48),
    updated_at: iso(23.9),
    last_reviewed_at: iso(23.9)
  };
}

const emptyLedger = { schema_version: "1.0.0", events: [] };
const emptyDirectory = { schema_version: "1.0.0", profiles: [] };
const empty = buildCommercialIntelligence(emptyLedger, emptyDirectory, { now });
assert.equal(empty.status, "no_verified_commercial_evidence");
assert.equal(empty.ranking, null);
assert.equal(empty.composite_score, null);
assert.equal(empty.summary.documented_brand_relationships, 0);
assert.equal(exportCommercialIntelligenceCsv(empty).trimEnd().split("\r\n").length, 1,
  "An empty report must export a header row only.");

const fixtures = [
  event({
    id: "deal-documented",
    related: [
      { id: "brand-001", display_name: "Synthetic Brand One", relationship: "sponsors", status: "documented" },
      { id: "brand-002", display_name: "Synthetic Brand Two", relationship: "sponsors", status: "claimed" }
    ]
  }),
  event({ id: "deal-no-counterparty", personId: "creator-002", personName: "Unmatched Test Creator", related: [] }),
  event({
    id: "endorsement-documented",
    type: "endorsement",
    related: [{ id: "organization-001", display_name: "Synthetic Organization", relationship: "endorses", status: "documented" }]
  }),
  event({
    id: "deal-low-confidence",
    confidence: "low",
    related: [{ id: "brand-low", display_name: "Low Confidence Brand", relationship: "sponsors", status: "documented" }]
  }),
  event({
    id: "deal-unverified",
    verification: "unverified",
    related: [{ id: "brand-unverified", display_name: "Unverified Brand", relationship: "sponsors", status: "documented" }]
  }),
  event({
    id: "deal-non-person",
    entityType: "outlet",
    related: [{ id: "brand-outlet", display_name: "Outlet Sponsor", relationship: "sponsors", status: "documented" }]
  }),
  event({
    id: "deal-future",
    hoursAgo: -1,
    related: [{ id: "brand-future", display_name: "Future Brand", relationship: "sponsors", status: "documented" }]
  })
];

const report = buildCommercialIntelligence(
  { schema_version: "1.0.0", events: fixtures },
  { schema_version: "1.0.0", profiles: [verifiedProfile()] },
  { now }
);

assert.equal(report.status, "evidence_available");
assert.equal(report.ranking, null);
assert.equal(report.composite_score, null);
assert.equal(report.summary.accepted_verified_events, 3);
assert.equal(report.summary.documented_brand_deal_events, 1);
assert.equal(report.summary.documented_brand_relationships, 1);
assert.equal(report.summary.distinct_sponsoring_entities, 1);
assert.equal(report.summary.documented_public_endorsements, 1);
assert.equal(report.summary.unresolved_brand_or_endorsement_claims, 2);
assert.equal(report.summary.directory_profile_matches, 1);
assert.equal(report.exclusions.low_confidence, 1);
assert.equal(report.exclusions.not_verified, 1);
assert.equal(report.exclusions.non_person_entity, 1);
assert.equal(report.exclusions.future_dated, 1);

const matched = report.entities.find(item => item.person.id === "creator-001");
assert.equal(matched.profile_match_status, "matched_verified_profile");
assert.equal(matched.documented_brand_relationships[0].sponsoring_entity.id, "brand-001");
assert.equal(matched.unresolved_claims[0].candidate_counterparties[0].status, "claimed");
assert.equal(matched.documented_public_endorsements[0].event.event_id, "endorsement-documented");
const unmatched = report.entities.find(item => item.person.id === "creator-002");
assert.equal(unmatched.profile_match_status, "no_directory_match");
assert.equal(unmatched.unresolved_claims.length, 1);

const formulaEvent = event({
  id: "deal-formula",
  personId: "creator-formula",
  personName: '=HYPERLINK("https://evil.example","open")',
  publisher: '=CMD("bad")',
  related: [{ id: "brand-formula", display_name: "=1+1", relationship: "sponsors", status: "documented" }]
});
const formulaReport = buildCommercialIntelligence(
  { schema_version: "1.0.0", events: [formulaEvent] },
  emptyDirectory,
  { now }
);
const csv = exportCommercialIntelligenceCsv(formulaReport);
assert.ok(csv.includes('"\'=HYPERLINK(""https://evil.example"",""open"")"'),
  "Formula-like person names must be neutralized and quotes escaped.");
assert.ok(csv.includes('"\'=CMD(""bad"")"'),
  "Formula-like publisher names must be neutralized.");
assert.ok(csv.includes('"\'=1+1"'),
  "Formula-like counterparty names must be neutralized.");
assert.equal(exportCommercialIntelligenceCsv(formulaReport), csv,
  "The CSV export must be deterministic.");

const futureCapture = event({
  id: "deal-future-capture",
  related: [{ id: "brand-capture", display_name: "Capture Brand", relationship: "sponsors", status: "documented" }]
});
futureCapture.source.captured_at = new Date(now.getTime() + 3600000).toISOString();
assert.equal(buildCommercialIntelligence(
  { schema_version: "1.0.0", events: [futureCapture] }, emptyDirectory, { now }
).exclusions.future_dated, 1);

assert.throws(() => buildCommercialIntelligence({ schema_version: "1.0.0", events: [{ event_id: "broken" }] }, emptyDirectory, { now }),
  /Invalid evidence ledger/);
assert.throws(() => exportCommercialIntelligenceCsv(null), /generated_at and an entities array/);

console.log("VILANOVA COMMERCIAL INTELLIGENCE TESTS PASSED — empty baseline, verified-only commercial events, documented sponsor relationships, separate endorsements, unresolved claims, exact profile matching, future-date exclusions, spreadsheet formula-injection protection and deterministic CSV.");
