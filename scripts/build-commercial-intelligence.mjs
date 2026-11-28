import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateLedger } from "./validate-evidence-ledger.mjs";
import { validateProfileDirectory } from "./validate-influencer-profiles.mjs";

const ELIGIBLE_TYPES = new Set(["brand_deal", "endorsement"]);
const ELIGIBLE_CONFIDENCE = new Set(["high", "medium"]);
const DAY = 86400000;

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const timestamp = value => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const normalizeName = value => String(value ?? "").normalize("NFKC").trim().replace(/\\s+/g, " ").toLocaleLowerCase("en");

function sourceRecord(event) {
  return {
    publisher: event.source.publisher,
    url: event.source.url,
    source_type: event.source.source_type,
    published_at: event.source.published_at,
    captured_at: event.source.captured_at
  };
}

function eventRecord(event) {
  return {
    event_id: event.event_id,
    claim: event.claim,
    source: sourceRecord(event),
    confidence: event.confidence,
    disclosure: {
      status: event.disclosure?.status ?? "unclear",
      text: event.disclosure?.text ?? null
    }
  };
}

function directoryMatch(person, profileMap) {
  const profile = profileMap.get(person.id);
  if (!profile) return { profile: null, status: "no_directory_match" };
  const acceptedNames = new Set([profile.display_name, ...(profile.aliases ?? [])].map(normalizeName));
  if (![person.display_name, ...(person.name_variants ?? [])].every(name => acceptedNames.has(normalizeName(name)))) {
    return { profile: null, status: "name_mismatch_requires_review" };
  }
  return {
    profile: { profile_id: profile.profile_id, display_name: profile.display_name, category: profile.category, status: profile.status },
    status: "matched_" + profile.status + "_profile"
  };
}

/**
 * Build a non-ranked, evidence-backed commercial intelligence report.
 * A documented sponsor relationship requires both a verified brand_deal event
 * and a related entity whose relationship is "sponsors" and status is "documented".
 */
export function buildCommercialIntelligence(ledger, directory, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("options.now must be a valid date");

  const ledgerErrors = validateLedger(ledger);
  if (ledgerErrors.length) throw new Error("Invalid evidence ledger: " + ledgerErrors.join("; "));
  const profileErrors = validateProfileDirectory(directory, { now: now.toISOString() });
  if (profileErrors.length) throw new Error("Invalid influencer directory: " + profileErrors.join("; "));

  const profileMap = new Map(directory.profiles.map(profile => [profile.profile_id, profile]));
  const people = new Map();
  const exclusions = {
    unsupported_event_type: 0,
    non_person_entity: 0,
    not_verified: 0,
    low_confidence: 0,
    future_dated: 0
  };
  const acceptedEventIds = new Set();

  function personFor(event) {
    const id = event.entity.id;
    if (!people.has(id)) {
      people.set(id, {
        person: { id, display_name: event.entity.display_name, entity_type: event.entity.entity_type },
        name_variants: [event.entity.display_name],
        documented_brand_relationships: [],
        documented_public_endorsements: [],
        unresolved_claims: []
      });
    } else {
      const person = people.get(id);
      if (!person.name_variants.includes(event.entity.display_name)) person.name_variants.push(event.entity.display_name);
    }
    return people.get(id);
  }

  function unresolved(person, event, claimType, candidates) {
    person.unresolved_claims.push({
      claim_type: claimType,
      event: eventRecord(event),
      candidate_counterparties: candidates.map(item => ({
        id: item.id,
        display_name: item.display_name,
        relationship: item.relationship,
        status: item.status
      })),
      reason: candidates.length
        ? "The counterparty relationship is claimed or unverified; do not present it as documented."
        : "No explicit counterparty relationship is recorded; the claim requires human review."
    });
  }

  for (const event of ledger.events) {
    if (!ELIGIBLE_TYPES.has(event.event_type)) {
      exclusions.unsupported_event_type++;
      continue;
    }
    if (!["person", "creator"].includes(event.entity.entity_type)) {
      exclusions.non_person_entity++;
      continue;
    }
    if (event.verification_status !== "verified") {
      exclusions.not_verified++;
      continue;
    }
    if (!ELIGIBLE_CONFIDENCE.has(event.confidence)) {
      exclusions.low_confidence++;
      continue;
    }
    const publishedAt = timestamp(event.source.published_at);
    const capturedAt = timestamp(event.source.captured_at);
    if (publishedAt === null || capturedAt === null || publishedAt > now.getTime() || capturedAt > now.getTime()) {
      exclusions.future_dated++;
      continue;
    }

    acceptedEventIds.add(event.event_id);
    const person = personFor(event);

    if (event.event_type === "brand_deal") {
      const candidates = (event.related_entities ?? []).filter(item => item.relationship === "sponsors");
      const documented = candidates.filter(item => item.status === "documented");
      const unresolvedCandidates = candidates.filter(item => item.status !== "documented");

      for (const item of documented) {
        person.documented_brand_relationships.push({
          sponsoring_entity: { id: item.id, display_name: item.display_name },
          relationship_status: "documented",
          event: eventRecord(event)
        });
      }
      if (unresolvedCandidates.length) unresolved(person, event, "brand_deal", unresolvedCandidates);
      if (!candidates.length) unresolved(person, event, "brand_deal", []);
    }

    if (event.event_type === "endorsement") {
      const candidates = (event.related_entities ?? []).filter(item => item.relationship === "endorses");
      const documented = candidates.filter(item => item.status === "documented");
      const unresolvedCandidates = candidates.filter(item => item.status !== "documented");

      for (const item of documented) {
        person.documented_public_endorsements.push({
          endorsed_entity: { id: item.id, display_name: item.display_name },
          relationship_status: "documented",
          event: eventRecord(event)
        });
      }
      if (unresolvedCandidates.length) unresolved(person, event, "public_endorsement", unresolvedCandidates);
      if (!candidates.length) unresolved(person, event, "public_endorsement", []);
    }
  }

  const entities = [...people.values()].map(person => {
    const match = directoryMatch(person.person, profileMap);
    person.documented_brand_relationships.sort((a, b) =>
      b.event.source.published_at.localeCompare(a.event.source.published_at) ||
      a.sponsoring_entity.display_name.localeCompare(b.sponsoring_entity.display_name, "en"));
    person.documented_public_endorsements.sort((a, b) =>
      b.event.source.published_at.localeCompare(a.event.source.published_at) ||
      a.endorsed_entity.display_name.localeCompare(b.endorsed_entity.display_name, "en"));
    person.unresolved_claims.sort((a, b) =>
      b.event.source.published_at.localeCompare(a.event.source.published_at));
    return {
      person: person.person,
      directory_profile: match.profile,
      profile_match_status: match.status,
      name_conflict: person.name_variants.length > 1,
      documented_brand_relationships: person.documented_brand_relationships,
      documented_public_endorsements: person.documented_public_endorsements,
      unresolved_claims: person.unresolved_claims
    };
  }).sort((a, b) => a.person.display_name.localeCompare(b.person.display_name, "en"));

  const brandRelationships = entities.flatMap(item => item.documented_brand_relationships);
  const endorsements = entities.flatMap(item => item.documented_public_endorsements);
  const unresolvedClaims = entities.flatMap(item => item.unresolved_claims);
  const acceptedEvents = ledger.events.filter(event => acceptedEventIds.has(event.event_id));
  const publicationTimes = acceptedEvents.map(event => timestamp(event.source.published_at)).filter(Number.isFinite);
  const distinctSponsoringEntities = new Set(brandRelationships.map(item => item.sponsoring_entity.id));

  return {
    schema_version: "1.0.0",
    generated_at: now.toISOString(),
    status: brandRelationships.length || endorsements.length ? "evidence_available" : "no_verified_commercial_evidence",
    reporting_period: publicationTimes.length ? {
      earliest_publication: new Date(Math.min(...publicationTimes)).toISOString(),
      latest_publication: new Date(Math.max(...publicationTimes)).toISOString()
    } : null,
    ranking: null,
    composite_score: null,
    policy: {
      eligible_event_types: [...ELIGIBLE_TYPES],
      eligible_verification_status: ["verified"],
      eligible_confidence: [...ELIGIBLE_CONFIDENCE],
      documented_brand_relationship_rule: "A verified brand_deal event plus an explicit related entity with relationship=sponsors and status=documented.",
      endorsement_rule: "Public endorsements are reported separately and are never treated as paid sponsorships without independent commercial evidence.",
      disclosure_rule: "Disclosure status is reproduced from the source record. Missing or unclear disclosure is not interpreted as proof that a relationship is undisclosed.",
      identity_matching: "Directory records are joined only by exact profile_id/entity.id and matching public display name or recorded alias.",
      ranking_rule: "No leaderboard, popularity score, fame score or composite influence score is calculated.",
      missing_data: "Unknown or absent evidence is not zero and is not a negative finding.",
      limitations: "This report processes only the local evidence ledger and public-profile directory. It does not fetch source URLs, query platform accounts, verify contracts, or establish private beneficial ownership."
    },
    summary: {
      profiles_in_directory: directory.profiles.length,
      people_with_eligible_events: entities.length,
      accepted_verified_events: acceptedEvents.length,
      documented_brand_deal_events: new Set(brandRelationships.map(item => item.event.event_id)).size,
      documented_brand_relationships: brandRelationships.length,
      distinct_sponsoring_entities: distinctSponsoringEntities.size,
      people_with_documented_brand_relationships: new Set(brandRelationships.map(item => item.event.event_id + "|" + entities.find(person => person.documented_brand_relationships.some(x => x.event.event_id === item.event.event_id))?.person.id)).size,
      documented_public_endorsement_events: new Set(endorsements.map(item => item.event.event_id)).size,
      documented_public_endorsements: endorsements.length,
      unresolved_brand_or_endorsement_claims: unresolvedClaims.length,
      directory_profile_matches: entities.filter(item => item.directory_profile !== null).length
    },
    exclusions,
    entities
  };
}

const CSV_COLUMNS = [
  "generated_at", "record_type", "person_id", "person_name", "profile_id", "profile_status",
  "profile_match_status", "counterparty_id", "counterparty_name", "relationship_status",
  "event_id", "claim", "source_publisher", "source_url", "published_at", "captured_at",
  "confidence", "disclosure_status", "disclosure_text", "evidence_status"
];

function csvCell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value).replace(/\\r\\n|\\r|\\n/g, " ");
  if (typeof value === "string" && /^[\\u0000-\\u0020]*[=+\\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

/** Flatten report records to deterministic, spreadsheet-safe CSV. */
export function exportCommercialIntelligenceCsv(report) {
  if (!isObject(report) || !Array.isArray(report.entities) || typeof report.generated_at !== "string")
    throw new Error("report must contain generated_at and an entities array");
  const rows = [CSV_COLUMNS];
  const pushRow = (person, recordType, counterparty, relationStatus, event, evidenceStatus) => {
    rows.push([
      report.generated_at, recordType, person.person.id, person.person.display_name,
      person.directory_profile?.profile_id ?? "", person.directory_profile?.status ?? "",
      person.profile_match_status, counterparty?.id ?? "", counterparty?.display_name ?? "",
      relationStatus ?? "", event.event_id, event.claim, event.source.publisher, event.source.url,
      event.source.published_at, event.source.captured_at, event.confidence,
      event.disclosure.status, event.disclosure.text ?? "", evidenceStatus
    ]);
  };

  for (const person of report.entities) {
    for (const item of person.documented_brand_relationships) {
      pushRow(person, "documented_brand_relationship", item.sponsoring_entity,
        item.relationship_status, item.event, "documented");
    }
    for (const item of person.documented_public_endorsements) {
      pushRow(person, "documented_public_endorsement", item.endorsed_entity,
        item.relationship_status, item.event, "documented_public_endorsement_not_paid_sponsorship");
    }
    for (const item of person.unresolved_claims) {
      pushRow(person, "unresolved_" + item.claim_type, null, null, item.event, "requires_human_review");
    }
  }
  return rows.map(row => row.map(csvCell).join(",")).join("\\r\\n") + "\\r\\n";
}

function run() {
  try {
    const ledger = JSON.parse(readFileSync(resolve(process.cwd(), "data/evidence-events.json"), "utf8"));
    const directory = JSON.parse(readFileSync(resolve(process.cwd(), "data/influencer-profiles.json"), "utf8"));
    const report = buildCommercialIntelligence(ledger, directory);
    if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else if (process.argv.includes("--csv")) process.stdout.write(exportCommercialIntelligenceCsv(report));
    else {
      console.log("VILANOVA COMMERCIAL INTELLIGENCE — " + report.status.toUpperCase());
      console.log("People: " + report.summary.people_with_eligible_events +
        " | Documented brand relationships: " + report.summary.documented_brand_relationships +
        " | Public endorsements: " + report.summary.documented_public_endorsements +
        " | Unresolved claims: " + report.summary.unresolved_brand_or_endorsement_claims);
      console.log("LIMITATION: " + report.policy.limitations);
    }
  } catch (error) {
    console.error("COMMERCIAL INTELLIGENCE BUILD FAILED:", error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run();
