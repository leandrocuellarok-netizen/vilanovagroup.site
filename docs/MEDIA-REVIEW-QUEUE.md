# VILANOVA AI MEDIA — Human Review Queue

**Implementation status:** local, deterministic queue builder; offline regression tests only.  
**Reviewed:** 28 November 2026.  
**Provider status:** GDELT adapter remains unconnected; no live polling or scheduled ingestion is enabled.

## Purpose

The GDELT DOC adapter discovers article candidates. This queue builder turns a saved adapter response into a structured human-review worklist. It does not fetch articles, scrape publisher pages, extract claims, infer political affiliation, calculate trends or write to the Evidence Ledger.

Every item remains \`news_discovery_candidate\` and \`unreviewed\`. \`publication_at\` is always \`null\`; GDELT's \`provider_seen_at\` is not the publisher's publication timestamp. The queue sets \`ledger_imported\` to \`false\` and does not create an Evidence Ledger event ID, verification status or confidence score.

## Local use

First, a researcher may manually invoke the GDELT adapter from an approved local script and save its returned JSON object. The adapter itself does not make a request merely by being imported. Then run:

\`\`\`bash
node scripts/build-media-review-queue.mjs artifacts/gdelt-discovery.json artifacts/media-review-queue.json
\`\`\`

The builder makes no network request. It validates the saved discovery result, normalizes and deduplicates canonical URLs, assigns stable SHA-256-derived candidate IDs, and writes the queue atomically. It refuses to overwrite the input file. The output directory is created when needed.

Run the offline regression suite:

\`\`\`bash
node scripts/test-media-review-queue.mjs
\`\`\`

## Candidate fields

- \`candidate_id\` — stable identifier derived from the canonical article URL.
- \`source_url\` — URL returned by the discovery provider.
- \`canonical_url\` — URL normalized for exact-source deduplication.
- \`source_domain\` — hostname derived from the canonical URL.
- \`provider_seen_at\` — provider observation time, if parseable.
- \`publication_at\` — deliberately null until checked against the original publisher page.
- \`captured_at\` — timestamp of the provider response retained by the adapter.
- \`review.steps\` — six required human checks, initially pending.

If duplicate canonical URLs are present, the builder keeps the candidate with the latest valid provider-seen timestamp; ties are resolved by title so the output is deterministic regardless of input order. This is exact URL deduplication only. Syndicated copies on other domains and semantically similar stories still require human comparison.

## Required human review

1. Open the original publisher page and confirm the publisher identity and canonical article URL.
2. Verify the article's actual publication timestamp and timezone. Record that timestamp only after direct inspection.
3. Identify the precise claim and its context; a headline alone is not sufficient evidence.
4. Compare other sources and decide whether they report the same underlying event. Do not treat syndicated copies as independent coverage signals.
5. Check attribution, copyright and permitted reuse. Store links and concise notes rather than copying full article text.
6. Record reviewer identity, review time, method and decision basis under the Evidence Ledger protocol.

Only after these checks may a researcher create a separate Evidence Ledger event that satisfies \`schemas/evidence-event.schema.json\`. The queue itself never changes to a verified record and is not a substitute for that event.

## Safety and interpretation limits

- Invalid URLs, mismatched domains, inconsistent capture timestamps, future provider-seen times, non-null publication timestamps and already-reviewed records are rejected.
- The builder accepts only \`gdelt-doc-2\` discovery responses and requires \`result_count\` to match the normalized input array length.
- The builder does not fetch, execute or render article content.
- Candidate count is a count of exact-source URLs in one provider response, not a count of unique stories, people discussing a topic or audience members.
- No reach, sentiment, political alignment, sponsorship, endorsement, truth or popularity claim is inferred.
- No live GDELT connection, API credential, paid provider, background job or deployment is configured.

## Files

- Adapter: \`scripts/gdelt-doc-adapter.mjs\`
- Queue builder: \`scripts/build-media-review-queue.mjs\`
- Queue schema: \`schemas/media-review-queue.schema.json\`
- Offline tests: \`scripts/test-media-review-queue.mjs\`
- Evidence promotion rules: \`docs/EVIDENCE-LEDGER.md\`
