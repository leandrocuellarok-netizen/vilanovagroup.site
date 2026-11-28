export const GDELT_DOC_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

const ALLOWED_TIMESPANS = new Set(["15min", "30min", "1h", "6h", "24h", "7d", "30d", "3m"]);
const ALLOWED_SORTS = new Set(["DateDesc", "DateAsc", "HybridRel", "ToneDesc", "ToneAsc"]);
const TRACKING_KEYS = new Set(["fbclid", "gclid", "dclid", "mc_cid", "mc_eid", "igshid", "vero_id"]);

export class GdeltAdapterError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "GdeltAdapterError";
    Object.assign(this, details);
  }
}

export function buildGdeltDocUrl({ query, timespan = "24h", maxRecords = 75, sort = "DateDesc" } = {}) {
  if (typeof query !== "string" || !query.trim()) throw new TypeError("A non-empty GDELT query is required.");
  if (query.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(query)) {
    throw new TypeError("The GDELT query must be at most 500 characters and contain no control characters.");
  }
  if (!ALLOWED_TIMESPANS.has(timespan)) throw new TypeError("Unsupported GDELT timespan: " + timespan);
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 250) {
    throw new RangeError("maxRecords must be an integer from 1 to 250.");
  }
  if (!ALLOWED_SORTS.has(sort)) throw new TypeError("Unsupported GDELT sort mode: " + sort);

  const url = new URL(GDELT_DOC_ENDPOINT);
  url.searchParams.set("query", query.trim());
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(maxRecords));
  url.searchParams.set("timespan", timespan);
  url.searchParams.set("sort", sort);
  return url.toString();
}

export function canonicalizeArticleUrl(value) {
  try {
    const url = new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || TRACKING_KEYS.has(lower)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    return url.toString();
  } catch {
    return null;
  }
}

function parseProviderSeenAt(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day) || date.getUTCHours() !== Number(hour) ||
      date.getUTCMinutes() !== Number(minute) || date.getUTCSeconds() !== Number(second)) return null;
  return date.toISOString();
}

function normalizeArticle(record, retrievedAt) {
  if (!record || typeof record !== "object") return null;
  const sourceUrl = typeof record.url === "string" ? record.url.trim() : "";
  const canonicalUrl = canonicalizeArticleUrl(sourceUrl);
  const title = typeof record.title === "string" ? record.title.trim().replace(/\s+/g, " ") : "";
  if (!canonicalUrl || !title) return null;

  const parsedUrl = new URL(canonicalUrl);
  return {
    title,
    source_url: sourceUrl,
    canonical_url: canonicalUrl,
    source_domain: parsedUrl.hostname.toLowerCase(),
    language: typeof record.language === "string" ? record.language : null,
    source_country: typeof record.sourcecountry === "string" ? record.sourcecountry : null,
    provider_seen_at: parseProviderSeenAt(record.seendate),
    publication_at: null,
    retrieved_at: retrievedAt,
    review_status: "unreviewed",
    evidence_class: "news_discovery_candidate"
  };
}

function normalizePayload(payload, retrievedAt) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.articles)) {
    throw new GdeltAdapterError("GDELT returned an unexpected JSON payload; an articles array was not present.", { code: "INVALID_PAYLOAD" });
  }
  const seen = new Set();
  const articles = [];
  for (const record of payload.articles) {
    const article = normalizeArticle(record, retrievedAt);
    if (!article || seen.has(article.canonical_url)) continue;
    seen.add(article.canonical_url);
    articles.push(article);
  }
  return articles;
}

function retryAfterMilliseconds(value, nowMs) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - nowMs) : null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createGdeltDocClient({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  minIntervalMs = 6000,
  cacheTtlMs = 15 * 60 * 1000,
  maxRetries = 1,
  baseBackoffMs = 6000,
  maxBackoffMs = 60000
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  for (const [name, value] of Object.entries({ minIntervalMs, cacheTtlMs, maxRetries, baseBackoffMs, maxBackoffMs })) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(name + " must be a non-negative number.");
  }
  if (!Number.isInteger(maxRetries) || maxRetries > 3) throw new RangeError("maxRetries must be an integer from 0 to 3.");

  let lastRequestAt = null;
  const cache = new Map();

  async function search(options = {}) {
    const requestUrl = buildGdeltDocUrl(options);
    const cached = cache.get(requestUrl);
    const currentTime = now();
    if (cached && currentTime - cached.cachedAt < cacheTtlMs) return clone(cached.value);

    let attempt = 0;
    while (true) {
      if (lastRequestAt !== null) {
        const elapsed = now() - lastRequestAt;
        const waitForSlot = Math.max(0, minIntervalMs - elapsed);
        if (waitForSlot > 0) await sleep(waitForSlot);
      }
      lastRequestAt = now();

      let response;
      try {
        response = await fetchImpl(requestUrl, { method: "GET", headers: { accept: "application/json" } });
      } catch (error) {
        if (attempt < maxRetries) {
          const delay = Math.min(maxBackoffMs, baseBackoffMs * (2 ** attempt));
          attempt++;
          await sleep(delay);
          continue;
        }
        throw new GdeltAdapterError("GDELT request failed before an HTTP response was received.", { code: "NETWORK_ERROR", cause: error });
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const headerDelay = retryAfterMilliseconds(response.headers?.get?.("retry-after"), now());
          const fallbackDelay = Math.min(maxBackoffMs, baseBackoffMs * (2 ** attempt));
          const delay = Math.min(maxBackoffMs, Math.max(minIntervalMs, headerDelay ?? fallbackDelay));
          attempt++;
          await sleep(delay);
          continue;
        }
        throw new GdeltAdapterError("GDELT request was rate-limited or temporarily unavailable.", {
          code: response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE",
          status: response.status,
          retry_after_ms: retryAfterMilliseconds(response.headers?.get?.("retry-after"), now())
        });
      }

      if (!response.ok) {
        throw new GdeltAdapterError("GDELT rejected the request with HTTP " + response.status + ".", { code: "HTTP_ERROR", status: response.status });
      }

      const contentType = response.headers?.get?.("content-type") ?? "";
      if (!contentType.toLowerCase().includes("json")) {
        throw new GdeltAdapterError("GDELT returned a non-JSON response; the body was not parsed.", { code: "NON_JSON_RESPONSE", status: response.status, content_type: contentType || null });
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new GdeltAdapterError("GDELT returned invalid JSON.", { code: "INVALID_JSON", cause: error });
      }

      const retrievedAt = new Date(now()).toISOString();
      const articles = normalizePayload(payload, retrievedAt);
      const result = {
        provider_id: "gdelt-doc-2",
        query: options.query.trim(),
        requested_timespan: options.timespan ?? "24h",
        requested_sort: options.sort ?? "DateDesc",
        retrieved_at: retrievedAt,
        result_count: articles.length,
        articles
      };
      cache.set(requestUrl, { cachedAt: now(), value: result });
      return clone(result);
    }
  }

  return { search, clearCache() { cache.clear(); } };
}
