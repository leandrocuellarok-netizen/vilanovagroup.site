# PUBLIC INFLUENCER PROFILE — REVIEW CADENCE

**Status:** proposed operational quality policy for the Argentina public influencer directory. These intervals are internal defaults, not legal requirements or platform rules.

## Review intervals

| Record | Default interval | Required action |
|---|---:|---|
| Public identity and profile | 90 days | Re-open official profile references and confirm that identity, category and public role remain accurate. |
| Captured source evidence | 180 days | Re-open the cited source, confirm that it still supports the exact claim, and record a new capture timestamp. |
| Provisional identity | Every review cycle | Seek an official-site cross-link, platform verification signal or official publication before changing status to verified. |
| Disputed identity | Immediate manual review | Keep the record out of verified outputs until the attribution conflict is resolved. |

## Run the audit

```bash
node scripts/audit-influencer-freshness.mjs
node scripts/audit-influencer-freshness.mjs --json
node scripts/audit-influencer-freshness.mjs --csv > influencer-review-queue.csv
```

The CSV is a flat, spreadsheet-ready work queue with one row per review issue and one row per stale source. Its columns preserve profile identity, review age, issue priority, source URL, capture date and action detail. Formula-like text is prefixed to prevent spreadsheet formula execution; embedded line breaks are flattened and CSV quotes are escaped.

The exported `auditProfileDirectory` function accepts a fixed `now` value for deterministic tests. `exportReviewQueueCsv` produces a deterministic RFC 4180-style CSV with stable headers.

## Automated review artifact

GitHub Actions creates both JSON and CSV snapshots after the review audit and regression tests pass. The files are uploaded as a short-lived workflow artifact named `influencer-review-queue` for operational download. The current directory is intentionally empty, so its initial CSV contains only the header row and its JSON status is `empty_directory`.

## Limitations

- The audit reads timestamps only; it does not make HTTP requests or test whether external links still work.
- A recent capture timestamp does not prove that a source is authoritative.
- A stale timestamp does not mean a person or account is inactive; it means a human reviewer should re-check the record.
- A verified profile is not permanently verified. Its evidence must be reviewed again.
- Do not add private contact information, sensitive traits, inferred political views or non-public relationship data.
- The CSV is a review queue, not an influencer ranking, popularity score or live social-listening feed.

## Review sequence

1. Run the profile schema validator.
2. Run the freshness audit and inspect its JSON or CSV output.
3. Resolve disputed records first, then provisional identities, then overdue verified profiles and source captures.
4. Open each cited URL and compare it with the exact recorded claim.
5. Update `last_reviewed_at` only after the review has actually occurred.
6. Capture new evidence with its real timestamp; never backdate it.
7. Re-run all validators and regression tests before publishing a report.

This queue is a research-quality control, not a popularity ranking, audience measurement or live social-listening feed.