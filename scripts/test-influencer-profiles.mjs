import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateProfileDirectory } from "./validate-influencer-profiles.mjs";

const now = "2026-11-27T22:00:00-03:00";
const empty = JSON.parse(readFileSync("data/influencer-profiles.json", "utf8"));
assert.deepEqual(validateProfileDirectory(empty, { now }), [], "An intentionally empty directory must be valid");

const source = {
  publisher: "Official public profile page",
  url: "https://example.org/creator",
  source_type: "official_site",
  published_at: "2026-11-27T10:00:00-03:00",
  captured_at: "2026-11-27T10:05:00-03:00",
  claim_supported: "The official website links to this creator's public channel."
};
const provisional = {
  profile_id: "sample-creator-001",
  display_name: "Synthetic Test Creator",
  category: "creator",
  country_code: "AR",
  status: "provisional",
  aliases: ["Synthetic Creator"],
  public_profiles: [{
    platform: "YouTube",
    handle: "@synthetic-test",
    url: "https://youtube.com/@synthetic-test",
    identity_status: "claimed",
    verification_method: "cross_linked_official_site",
    source
  }],
  evidence: [source],
  created_at: "2026-11-27T10:00:00-03:00",
  updated_at: "2026-11-27T10:05:00-03:00",
  last_reviewed_at: "2026-11-27T10:05:00-03:00"
};
assert.deepEqual(validateProfileDirectory({ schema_version: "1.0.0", profiles: [provisional] }, { now }), [],
  "A source-backed provisional public profile must pass");

const verified = structuredClone(provisional);
verified.profile_id = "sample-creator-verified";
verified.status = "verified";
verified.public_profiles[0].identity_status = "verified";
verified.public_profiles[0].verification_method = "cross_linked_official_site";
assert.deepEqual(validateProfileDirectory({ schema_version: "1.0.0", profiles: [verified] }, { now }), [],
  "Verified status must pass only with trusted identity and official evidence");

const noProof = structuredClone(verified);
noProof.public_profiles[0].verification_method = "self_declared";
assert.ok(validateProfileDirectory({ schema_version: "1.0.0", profiles: [noProof] }, { now })
  .some(error => error.includes("verified identity requires")),
  "A self-declared identity must not qualify as verified");

const privateField = structuredClone(provisional);
privateField.email = "private@example.org";
assert.ok(validateProfileDirectory({ schema_version: "1.0.0", profiles: [privateField] }, { now })
  .some(error => error.includes("email is not an allowed field")),
  "Private contact data must be rejected by the strict profile contract");

const duplicateUrl = structuredClone(provisional);
duplicateUrl.profile_id = "sample-creator-002";
duplicateUrl.display_name = "Another Test Label";
assert.ok(validateProfileDirectory({ schema_version: "1.0.0", profiles: [provisional, duplicateUrl] }, { now })
  .some(error => error.includes("duplicate public profile URL")),
  "The same canonical public profile must not be attached to multiple identities");

const duplicateHandle = structuredClone(provisional);
duplicateHandle.profile_id = "sample-creator-003";
duplicateHandle.public_profiles[0].url = "https://youtube.com/@another-url";
assert.ok(validateProfileDirectory({ schema_version: "1.0.0", profiles: [provisional, duplicateHandle] }, { now })
  .some(error => error.includes("duplicate platform handle")),
  "A platform handle must be unique within the directory");

const futureSource = structuredClone(provisional);
futureSource.profile_id = "sample-creator-004";
futureSource.public_profiles[0].source.captured_at = "2026-11-28T00:00:00-03:00";
assert.ok(validateProfileDirectory({ schema_version: "1.0.0", profiles: [futureSource] }, { now })
  .some(error => error.includes("captured_at cannot be in the future")),
  "Future-dated source capture must be rejected");

const publicationAfterCapture = structuredClone(provisional);
publicationAfterCapture.profile_id = "sample-creator-005";
publicationAfterCapture.evidence[0].published_at = "2026-11-27T10:10:00-03:00";
publicationAfterCapture.evidence[0].captured_at = "2026-11-27T10:05:00-03:00";
assert.ok(validateProfileDirectory({ schema_version: "1.0.0", profiles: [publicationAfterCapture] }, { now })
  .some(error => error.includes("published_at cannot be later than captured_at")),
  "Publication cannot occur after the recorded capture time");

const duplicateId = structuredClone(provisional);
assert.ok(validateProfileDirectory({ schema_version: "1.0.0", profiles: [provisional, duplicateId] }, { now })
  .some(error => error.includes("duplicate profile_id")),
  "Profile IDs must be unique");

console.log("VILANOVA PUBLIC INFLUENCER DIRECTORY TESTS PASSED — empty baseline, provisional and verified identities, provenance, private-field rejection, duplicate IDs/URLs/handles and timestamp integrity.");
