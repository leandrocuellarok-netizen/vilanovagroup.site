import assert from "node:assert/strict";
import {
  GDELT_DOC_ENDPOINT,
  GdeltAdapterError,
  buildGdeltDocUrl,
  canonicalizeArticleUrl,
  createGdeltDocClient
} from "./gdelt-doc-adapter.mjs";

const built = new URL(buildGdeltDocUrl({
  query: '("inflación" OR "dólar") sourcecountry:ARG sourcelang:Spanish',
  timespan: "24h",
  maxRecords: 75,
  sort: "DateDesc"
}));
assert.equal(built.origin + built.pathname, GDELT_DOC_ENDPOINT);
assert.equal(built.searchParams.get("mode"), "ArtList");
assert.equal(built.searchParams.get("format"), "json");
assert.equal(built.searchParams.get("maxrecords"), "75");
assert.equal(built.searchParams.get("timespan"), "24h");
assert.equal(built.searchParams.get("sort"), "DateDesc");
assert.match(built.searchParams.get("query"), /sourcecountry:ARG/);
assert.throws(() => buildGdeltDocUrl({ query: " " }), /non-empty/);
assert.throws(() => buildGdeltDocUrl({ query: "news", maxRecords: 251 }), /1 to 250/);
assert.throws(() => buildGdeltDocUrl({ query: "news", timespan: "12h" }), /Unsupported GDELT timespan/);
assert.throws(() => buildGdeltDocUrl({ query: "news", sort: "Random" }), /Unsupported GDELT sort/);
assert.throws(() => createGdeltDocClient({ maxRetries: 4 }), /0 to 3/);
assert.equal(canonicalizeArticleUrl("https://EXAMPLE.com/story/?utm_source=mail&fbclid=abc#top"), "https://example.com/story/");
assert.equal(canonicalizeArticleUrl("javascript:alert(1)"), null);

const fixedNow = Date.parse("2026-11-28T09:00:00.000Z");
const payload = {
  articles: [
    { title: "  Central Bank reform passes Congress  ", url: "https://news.example.ar/politics/bcra?utm_source=mail", seendate: "20261128T084500Z", language: "Spanish", sourcecountry: "Argentina" },
    { title: "Central Bank reform passes Congress", url: "https://news.example.ar/politics/bcra?fbclid=tracking#article", seendate: "20261128T084500Z", language: "Spanish", sourcecountry: "Argentina" },
    { title: "Invalid URL must be discarded", url: "javascript:alert(1)", seendate: "20261128T084500Z" },
    { title: "Malformed provider timestamp remains unknown", url: "https://another.example.ar/story", seendate: "20261128T996199Z" }
  ]
};
const jsonResponse = body => ({
  status: 200,
  ok: true,
  headers: { get(name) { return name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null; } },
  async json() { return body; }
});

let clock = fixedNow;
const sleeps = [];
const requests = [];
const client = createGdeltDocClient({
  fetchImpl: async (url, init) => { requests.push({ url, init }); return jsonResponse(payload); },
  now: () => clock,
  sleep: async milliseconds => { sleeps.push(milliseconds); clock += milliseconds; },
  minIntervalMs: 6000,
  cacheTtlMs: 900000
});
const first = await client.search({ query: '"Banco Central" sourcecountry:ARG', timespan: "24h", maxRecords: 75 });
assert.equal(first.provider_id, "gdelt-doc-2");
assert.equal(first.result_count, 2, "Tracking variants must collapse to one canonical article and unsafe URLs must be discarded");
assert.equal(first.articles[0].provider_seen_at, "2026-11-28T08:45:00.000Z");
assert.equal(first.articles[0].publication_at, null, "GDELT seen time must never be mislabelled as publisher publication time");
assert.equal(first.articles[0].review_status, "unreviewed");
assert.equal(first.articles[1].provider_seen_at, null, "Malformed or out-of-range provider timestamps must remain unknown");
assert.equal(requests.length, 1);
const cached = await client.search({ query: '"Banco Central" sourcecountry:ARG', timespan: "24h", maxRecords: 75 });
assert.deepEqual(cached, first);
assert.equal(requests.length, 1, "A successful query must be served from the in-memory cache");
await client.search({ query: '"Presupuesto 2027" sourcecountry:ARG', timespan: "24h", maxRecords: 75 });
assert.equal(requests.length, 2);
assert.ok(sleeps.includes(6000), "Different uncached queries must respect the local request pacing guard");

let retryClock = fixedNow;
const retrySleeps = [];
let retryCalls = 0;
const retryClient = createGdeltDocClient({
  fetchImpl: async () => {
    retryCalls++;
    if (retryCalls === 1) return {
      status: 429,
      ok: false,
      headers: { get(name) { return name.toLowerCase() === "retry-after" ? "7" : null; } }
    };
    return jsonResponse({ articles: [] });
  },
  now: () => retryClock,
  sleep: async milliseconds => { retrySleeps.push(milliseconds); retryClock += milliseconds; },
  minIntervalMs: 6000,
  maxRetries: 1
});
const retried = await retryClient.search({ query: "Argentina", timespan: "24h" });
assert.equal(retried.result_count, 0);
assert.equal(retryCalls, 2);
assert.ok(retrySleeps.includes(7000), "A Retry-After header must be honoured");

const htmlClient = createGdeltDocClient({
  fetchImpl: async () => ({ status: 200, ok: true, headers: { get() { return "text/html"; } }, async json() { throw new Error("must not parse HTML"); } }),
  now: () => fixedNow,
  sleep: async () => {}
});
await assert.rejects(() => htmlClient.search({ query: "Argentina" }), error => error instanceof GdeltAdapterError && error.code === "NON_JSON_RESPONSE");

const malformedClient = createGdeltDocClient({
  fetchImpl: async () => jsonResponse({ results: [] }),
  now: () => fixedNow,
  sleep: async () => {}
});
await assert.rejects(() => malformedClient.search({ query: "Argentina" }), error => error instanceof GdeltAdapterError && error.code === "INVALID_PAYLOAD");

const limitedClient = createGdeltDocClient({
  fetchImpl: async () => ({ status: 429, ok: false, headers: { get() { return null; } } }),
  now: () => fixedNow,
  sleep: async () => {},
  maxRetries: 0
});
await assert.rejects(() => limitedClient.search({ query: "Argentina" }), error => error instanceof GdeltAdapterError && error.code === "RATE_LIMITED");

console.log("GDELT DOC ADAPTER TESTS PASSED — URL validation, query bounds, safe URL normalization, timestamp provenance, deduplication, caching, pacing, Retry-After, non-JSON rejection, malformed payload rejection and honest unreviewed status.");
