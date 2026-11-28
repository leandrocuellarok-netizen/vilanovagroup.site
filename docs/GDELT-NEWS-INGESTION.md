# VILANOVA AI MEDIA — GDELT DOC 2.0 News Ingestion Protocol

**Implementation status:** dependency-free adapter prototype; offline regression tests only.  
**Reviewed:** 28 November 2026.  
**Connection status:** not connected. No live polling, account, key, paid service or scheduled ingestion is active.

## Purpose and boundaries

The adapter is a read-only discovery layer for publicly indexed online-news articles. It is not a social-listening system, a hashtag-volume provider, an audience-measurement service, a fact-checking engine or a political-affiliation classifier.

A returned article is an **unreviewed research candidate**. It must not enter the Evidence Ledger as a verified claim until a human researcher opens the original publisher page, confirms the relevant passage and date, records source and capture provenance, and completes the required reviewer decision.

## Endpoint and request contract

The prototype targets the public GDELT DOC 2.0 endpoint:

https://api.gdeltproject.org/api/v2/doc/doc

It requests mode=ArtList, format=json, a bounded maxrecords value and an explicit timespan. The adapter currently permits these windows: 15min, 30min, 1h, 6h, 24h, 7d, 30d and 3m. It defaults to 75 results and refuses values above 250.

Example query for a manually initiated Argentina desk search:

("inflación" OR "dólar" OR "Banco Central") sourcecountry:ARG sourcelang:Spanish

The query is deliberately supplied by the researcher. The adapter does not invent trending topics or run a permanent keyword list. GDELT's documented DOC 2.0 article-list window is rolling and limited to the latest three months; the documented minimum timespan is 15 minutes. Article-list results are capped at 250 records. See the official [GDELT DOC 2.0 API announcement and parameter guide](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/).

## Request safety and resource controls

- The adapter is a module; importing it makes no network request.
- Tests inject a mock fetch implementation. CI does not call GDELT.
- The client caches successful responses in memory for 15 minutes. The cache is process-local and is not a durable production cache.
- A local minimum interval of six seconds is enforced between uncached requests. This is a conservative Vilanova guardrail, not a published GDELT service-level guarantee. A GDELT Cloud guide updated 13 November 2026 reports observing a 429 response body asking clients to limit requests to one every five seconds; the adapter adds a one-second margin and still treats 429 as authoritative.
- On HTTP 429 or 5xx, the client makes at most one retry by default, honours a valid Retry-After header when present and otherwise uses bounded backoff. It fails closed after the retry.
- Non-JSON responses, invalid JSON and unexpected payload shapes are rejected; an HTTP 200 HTML error page is never treated as an empty news result.
- The prototype caps query length, timespan, sort mode and result count.

Rate-limit observation source: [GDELT Project API guide — DOC 2.0, Events, GKG and GEO](https://gdeltcloud.com/gdelt-api), updated 13 November 2026. This is a third-party technical guide, not a GDELT contractual rate-limit specification.

## Provenance model

Each normalized article retains:

- title — provider-returned headline;
- source_url — original provider-returned URL;
- canonical_url — URL normalized for exact-source deduplication;
- source_domain — hostname derived from the canonical URL;
- language and source_country — provider metadata, when supplied;
- provider_seen_at — the provider's seendate value, when parseable;
- publication_at — always null in this adapter until verified from the publisher page;
- retrieved_at — capture time recorded by the adapter;
- review_status — always unreviewed;
- evidence_class — always news_discovery_candidate.

The adapter intentionally does not equate the provider's seen timestamp with the publisher's publication timestamp. A researcher must confirm publication time from the original source. It also does not infer truth, political alignment, endorsement, sponsorship, sentiment, unique audience or reach from an article result.

Canonical URL deduplication removes fragments and common tracking parameters (utm_*, fbclid, gclid and selected campaign identifiers). It does not detect syndicated copies hosted on different domains or semantically similar stories; those require a separate review process.

## Output interpretation

- result_count is the number of normalized, exact-URL-deduplicated candidates returned by this adapter—not the number of people discussing a topic.
- GDELT coverage volume is a measure of monitored news coverage, not public opinion or total social conversation.
- A list of matching articles is not a trend ranking. A trend claim requires a defined comparison window, a stable query, deduplication, source coverage notes and a documented baseline.
- Hashtag counts and social reach are outside this adapter's scope.
- Article headlines and links are discovery metadata. Do not republish full article text; respect each publisher's copyright and reuse terms.

## Files and test procedure

- Adapter: scripts/gdelt-doc-adapter.mjs
- Offline regression suite: scripts/test-gdelt-doc-adapter.mjs
- Run: node scripts/test-gdelt-doc-adapter.mjs

The tests cover query construction, input bounds, URL safety, tracking-parameter normalization, exact-URL deduplication, timestamp provenance, cache behaviour, request pacing, Retry-After, non-JSON rejection and malformed payload handling.

## Production gate

Before a live pilot, review current GDELT project terms and attribution expectations, choose an explicit query allowlist, decide on a persistent cache and retention period, and define a human review queue. Do not run unattended high-frequency polling. No live provider connection or deployment is implied by this prototype.
