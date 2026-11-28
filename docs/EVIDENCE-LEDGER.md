# VILANOVA EVIDENCE LEDGER

**Status:** schema and validation contract only. The initial ledger is intentionally empty; no influencer, brand deal, endorsement, audience figure, ownership claim or trend is asserted by this file.

## Purpose

Use one evidence-event format across VILANOVA AI MEDIA and INFLUENCE RADAR AI. The ledger stores source-backed observations, not unqualified conclusions. A report or score must be reproducible from the underlying events.

## Required discipline

- Every event has a stable ID, entity, claim, source URL, publisher, capture timestamp, verification status and confidence.
- Use HTTPS source URLs. For brand deals, endorsements, public appearances, news mentions and ownership claims, publication time is mandatory; capture time alone cannot establish when the event occurred.
- Publication time must not be later than capture time. An observation-window end must not be later than the capture timestamp. Preserve both timestamps so recency can be audited independently.
- Store timestamps with an explicit UTC offset; render them in America/Argentina/Buenos_Aires for the Argentina desk.
- Add an observation window for platform metrics, hashtag observations and trend signals. A 24-hour score must identify its exact start and end.
- A metric records its platform, scope, unit and comparison window. Views are not unique reach; views are not simultaneous viewers.
- Unknown data is omitted or marked unverified. It is never converted to zero.
- A mention is not automatically an endorsement. A public post is not automatically a disclosed sponsorship.
- Keep claims about ownership/control separate from claims about editorial alignment or political affiliation.
- Do not publish a composite influence score unless coverage, weighting version, normalization and source confidence are disclosed.

## Verification states

| State | Meaning |
|---|---|
| verified | The stated fact is directly supported by the linked source and has been checked. |
| unverified | A source exists, but the claim has not been independently confirmed. |
| disputed | Credible sources materially conflict or the subject contests the claim. |
| withdrawn | The claim was retracted, superseded or found unsuitable for use. |

Confidence is a separate assessment of source quality and claim support. It must not be used as a substitute for verification status.

## Verification review record

Every `verified`, `disputed` or `withdrawn` event must carry a `review` object with a stable internal `reviewer_id`, ISO 8601 `reviewed_at` timestamp, review `method` and a concise `decision_basis`. The review timestamp cannot predate the source capture. Use an internal reviewer identifier, not a personal email address or phone number. A status is not self-authenticating: setting `verification_status: verified` without this review provenance is rejected by the validator.

## Files

- schemas/evidence-event.schema.json — machine-readable JSON Schema.
- data/evidence-events.json — append-only event ledger; currently empty.
- scripts/validate-evidence-ledger.mjs — dependency-free runtime validator, including reviewer provenance and review chronology.
- scripts/test-evidence-ledger.mjs — positive and negative regression tests.

## Operational rules

1. Capture a source before writing an analytical conclusion.
2. Preserve the original source URL and publisher; do not cite search snippets as the sole evidence.
3. Record the capture time even when publication time is unavailable.
4. Deduplicate syndicated or repeated items before calculating prominence.
5. Keep raw observations immutable; corrections should create a new event or an explicit superseding record rather than silently rewriting history.
6. Do not infer sentiment, political alignment, sponsorship, reach or ownership from proximity or repeated mentions.
7. If an API feed becomes stale or unavailable, label the dashboard stale/unavailable. Never animate old values as live.

This ledger is a technical foundation, not a live data connection or a claim that Vilanova currently has access to any provider.

## Media discovery provenance

A news event promoted from the GDELT human-review queue may include a `provenance` object containing the provider ID, queue ID, candidate ID and the fixed `human_review_queue` promotion method. The validator checks these identifiers and rejects a second ledger event derived from the same candidate. This link is an audit reference, not a claim that GDELT verified the article. The source publisher page and the human review record remain the basis for any verification decision.

Promotion is performed locally from a saved queue and a separate adjudication record. It does not fetch article pages, modify the source queue, write to GitHub or bypass the existing event validator.
