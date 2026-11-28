# VILANOVA AI MEDIA — Reviewed Evidence Promotion

**Status:** offline, deterministic local promotion utility with regression tests.  
**Reviewed:** 28 November 2026.  
**Provider status:** GDELT remains unconnected; no scheduled ingestion or live feed is enabled.

## Purpose

The discovery queue deliberately contains unreviewed candidates, not Evidence Ledger events. This utility provides a controlled bridge from one candidate to one separately reviewed `news_mention` event. It never treats provider discovery as verification.

## Required inputs

1. A saved GDELT media review queue produced by `scripts/build-media-review-queue.mjs`.
2. A separate human adjudication JSON record conforming to `schemas/media-review-decision.schema.json`.
3. The current Evidence Ledger JSON.
4. A new output path for the proposed ledger.

The adjudication record must identify the queue and candidate, provide a stable event ID, a precise claim, entity, publisher, source publication timestamp, confidence, review method, reviewer ID, final review timestamp and decision basis. All six review steps must be completed in the prescribed order. Every step must include a check timestamp, HTTPS evidence URL and concise notes.

## Chronology and source rules

- The source URL must remain HTTPS and match the candidate's canonical URL.
- The publisher's publication timestamp must be independently checked against the original publisher page and cannot be later than the queue capture time.
- Every step timestamp must fall between candidate capture and final review.
- Final review cannot predate candidate capture.
- Reviewer identity is an internal stable identifier, never a personal email address or phone number.
- Decisions remain explicit: `verified`, `unverified`, `disputed` or `withdrawn`. The tool does not upgrade an unverified decision.
- Confidence is separately supplied and is not inferred from the decision state.

## Local use

```bash
node scripts/promote-reviewed-media-candidate.mjs artifacts/media-review-queue.json artifacts/media-review-decision.json data/evidence-events.json artifacts/proposed-evidence-events.json
```

The utility performs no network request and does not fetch or scrape article pages. It validates the existing ledger, validates the six-step review record, creates a single `news_mention` event, attaches provider/queue/candidate provenance, validates the proposed ledger again and writes a new file atomically.

It refuses to overwrite any input or existing output file. The original queue remains unchanged and continues to identify the candidate as unreviewed; the new Evidence Ledger event carries the immutable provenance link. A candidate or event ID already present in the ledger is rejected.

Run the regression suite:

```bash
node scripts/test-media-evidence-promotion.mjs
```

## Limitations

This is a local file transformation, not an approval workflow UI, signed audit log, database transaction or live ingestion service. The script cannot independently confirm that a reviewer actually opened a source URL or performed the six checks; it validates the completeness and chronology of the submitted record. Production use requires authenticated reviewer identities, access control, tamper-evident audit storage and a secure backend. No provider, account, paid service or external API is connected.

## Related contracts

- `schemas/media-review-queue.schema.json`
- `schemas/media-review-decision.schema.json`
- `schemas/evidence-event.schema.json`
- `docs/MEDIA-REVIEW-QUEUE.md`
- `docs/EVIDENCE-LEDGER.md`
