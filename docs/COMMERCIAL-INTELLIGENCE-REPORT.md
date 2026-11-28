# VILANOVA COMMERCIAL INTELLIGENCE REPORT

**Status:** deterministic report builder and export contract. The current source ledgers are intentionally empty; no creator, brand, sponsorship, endorsement or commercial relationship is asserted by this document.

## Purpose

Convert the Evidence Ledger and Argentina Public Influencer Directory into a source-attributed commercial research deliverable for agencies, brands, media buyers and corporate strategy teams.

This is an evidence-processing layer, not an audience measurement product, paid social-listening service, legal due-diligence opinion or influencer ranking.

## Inclusion rules

A record is eligible only when:

1. Its event type is `brand_deal` or `endorsement`.
2. The primary entity is a person or creator.
3. The event verification status is `verified`.
4. Confidence is `high` or `medium`.
5. Publication and capture timestamps are present, valid and not in the future relative to report generation.

A documented sponsoring relationship requires both a verified `brand_deal` event and a related entity with `relationship: sponsors` and `status: documented`.

A public endorsement is reported separately. It is never automatically treated as paid sponsorship or a commercial agreement.

## Unresolved claims

A verified event whose counterparty is absent, claimed or unverified is retained in the report's unresolved-claims section. It is not promoted to a documented relationship. A human reviewer must open the source and resolve the counterparty evidence before the record can be used as a confirmed commercial relationship.

## Identity matching

A person is joined to the public influencer directory only when `entity.id` exactly matches `profile_id` and the event display name matches the profile display name or a recorded alias. Name conflicts require manual review. A missing profile match does not erase the source event, but it remains visibly unmatched.

## Disclosure handling

The report reproduces the disclosure status stored with the event: `disclosed`, `not_disclosed`, `unclear` or `not_applicable`. Missing disclosure data is represented as `unclear`. It is not evidence that a relationship was hidden or that a legal violation occurred.

## Outputs

- JSON: grouped person records, profile match status, documented brand relationships, public endorsements, unresolved claims, source provenance and exclusions.
- CSV: one row per documented relationship or unresolved claim, with stable headers and spreadsheet-formula neutralization.
- Both exports include generation time and original source URLs, publisher, publication date, capture date and confidence.

The report intentionally emits no leaderboard, composite score, fame score, audience estimate or commercial value estimate.

## Current limitations

- The report reads only `data/evidence-events.json` and `data/influencer-profiles.json`.
- It does not fetch source URLs or verify that a page remains available.
- It does not query private platform analytics or infer contracts from images, tags, guest appearances or co-occurrence.
- It does not calculate reach, engagement, sentiment, brand lift, price or ROI.
- An empty report means no eligible local evidence is currently recorded. It does not mean that no sponsorships or endorsements exist in the market.
- Human source review remains necessary before commercial delivery.

## Run locally

```bash
node scripts/build-commercial-intelligence.mjs
node scripts/build-commercial-intelligence.mjs --json
node scripts/build-commercial-intelligence.mjs --csv > commercial-intelligence.csv
node scripts/test-commercial-intelligence.mjs
```

## Automated delivery

GitHub Actions builds JSON and CSV exports after the regression tests pass and uploads them as a short-lived artifact named `commercial-intelligence-report`. The artifact is a working research export, not a public database or a verified market ranking.

**Commercial principle:** sell transparent research and documented evidence before committing to expensive real-time data infrastructure.
