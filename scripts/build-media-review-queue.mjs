import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeArticleUrl } from "./gdelt-doc-adapter.mjs";

const REVIEW_STEPS = Object.freeze([
  "publisher_identity_and_original_page",
  "publication_timestamp",
  "claim_and_article_context",
  "cross_source_duplicate_story_check",
  "copyright_and_attribution_check",
  "human_reviewer_decision"
]);

function canonicalIso(value, label) {
  if (typeof value !== "string") throw new TypeError(label + " must be a canonical UTC ISO timestamp.");
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new TypeError(label + " must be a canonical UTC ISO timestamp.");
  }
  return milliseconds;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validateArticle(article, retrievedAt) {
  if (!article || typeof article !== "object" || Array.isArray(article)) {
    throw new TypeError("Every discovery article must be an object.");
  }
  const title = typeof article.title === "string" ? article.title.trim().replace(/\s+/g, " ") : "";
  if (!title || title.length > 500) throw new TypeError("Every candidate must have a title from 1 to 500 characters.");

  const canonicalUrl = canonicalizeArticleUrl(article.canonical_url);
  const sourceCanonicalUrl = canonicalizeArticleUrl(article.source_url);
  if (!canonicalUrl || canonicalUrl !== article.canonical_url || !sourceCanonicalUrl || sourceCanonicalUrl !== canonicalUrl) {
    throw new TypeError("Candidate source_url and canonical_url must resolve to the same safe HTTP(S) URL.");
  }
  const parsedUrl = new URL(canonicalUrl);
  if (typeof article.source_domain !== "string" || article.source_domain.toLowerCase() !== parsedUrl.hostname.toLowerCase()) {
    throw new TypeError("Candidate source_domain must match the canonical URL hostname.");
  }
  if (article.retrieved_at !== retrievedAt) throw new TypeError("Candidate retrieved_at must match the discovery capture timestamp.");
  if (article.publication_at !== null) throw new TypeError("Publisher publication_at must remain null until a human verifies the original page.");
  if (article.review_status !== "unreviewed" || article.evidence_class !== "news_discovery_candidate") {
    throw new TypeError("Only unreviewed news_discovery_candidate records can enter this queue.");
  }
  if (article.provider_seen_at !== null) {
    const seenAt = canonicalIso(article.provider_seen_at, "provider_seen_at");
    if (seenAt > canonicalIso(retrievedAt, "retrieved_at")) throw new TypeError("provider_seen_at cannot be later than retrieval time.");
  }
  for (const field of ["language", "source_country"]) {
    if (article[field] !== null && typeof article[field] !== "string") {
      throw new TypeError(field + " must be a string or null.");
    }
  }
  return {
    title,
    source_url: article.source_url,
    canonical_url: canonicalUrl,
    source_domain: parsedUrl.hostname.toLowerCase(),
    language: article.language ?? null,
    source_country: article.source_country ?? null,
    provider_seen_at: article.provider_seen_at ?? null,
    publication_at: null,
    captured_at: retrievedAt
  };
}

function chooseDuplicate(existing, candidate) {
  const existingSeen = existing.provider_seen_at ? Date.parse(existing.provider_seen_at) : -1;
  const candidateSeen = candidate.provider_seen_at ? Date.parse(candidate.provider_seen_at) : -1;
  if (candidateSeen !== existingSeen) return candidateSeen > existingSeen ? candidate : existing;
  return candidate.title.localeCompare(existing.title) < 0 ? candidate : existing;
}

export function buildMediaReviewQueue(discoveryResult, { generatedAt = new Date().toISOString() } = {}) {
  if (!discoveryResult || typeof discoveryResult !== "object" || Array.isArray(discoveryResult)) {
    throw new TypeError("A GDELT discovery result object is required.");
  }
  if (discoveryResult.provider_id !== "gdelt-doc-2") throw new TypeError("Only gdelt-doc-2 discovery results are accepted.");
  if (typeof discoveryResult.query !== "string" || !discoveryResult.query.trim() || discoveryResult.query.length > 500) {
    throw new TypeError("The original non-empty GDELT query must be retained.");
  }
  const retrievedAtMs = canonicalIso(discoveryResult.retrieved_at, "retrieved_at");
  const generatedAtMs = canonicalIso(generatedAt, "generated_at");
  if (generatedAtMs < retrievedAtMs) throw new TypeError("generated_at cannot precede provider retrieval time.");
  if (!Array.isArray(discoveryResult.articles)) throw new TypeError("The discovery result must contain an articles array.");
  if (!Number.isInteger(discoveryResult.result_count) || discoveryResult.result_count !== discoveryResult.articles.length) {
    throw new TypeError("result_count must equal the number of normalized discovery articles.");
  }

  const byCanonicalUrl = new Map();
  for (const rawArticle of discoveryResult.articles) {
    const article = validateArticle(rawArticle, discoveryResult.retrieved_at);
    const previous = byCanonicalUrl.get(article.canonical_url);
    byCanonicalUrl.set(article.canonical_url, previous ? chooseDuplicate(previous, article) : article);
  }

  const candidates = [...byCanonicalUrl.values()]
    .sort((a, b) => {
      const aSeen = a.provider_seen_at ? Date.parse(a.provider_seen_at) : -1;
      const bSeen = b.provider_seen_at ? Date.parse(b.provider_seen_at) : -1;
      return bSeen - aSeen || a.canonical_url.localeCompare(b.canonical_url);
    })
    .map(article => ({
      candidate_id: "mc_" + digest(article.canonical_url).slice(0, 24),
      ...article,
      evidence_class: "news_discovery_candidate",
      review_status: "unreviewed",
      review: {
        status: "pending",
        decision: null,
        reviewer_id: null,
        reviewed_at: null,
        decision_basis: null,
        steps: REVIEW_STEPS.map(step_id => ({ step_id, status: "pending" }))
      }
    }));

  const query = discoveryResult.query.trim();
  const queueId = "mrq_" + digest(["gdelt-doc-2", query, discoveryResult.retrieved_at].join("\n")).slice(0, 24);
  return {
    schema_version: "1.0.0",
    queue_id: queueId,
    provider_id: "gdelt-doc-2",
    query,
    requested_timespan: discoveryResult.requested_timespan ?? "24h",
    requested_sort: discoveryResult.requested_sort ?? "DateDesc",
    provider_retrieved_at: discoveryResult.retrieved_at,
    generated_at: generatedAt,
    queue_status: "awaiting_human_review",
    source_result_count: discoveryResult.result_count,
    candidate_count: candidates.length,
    duplicate_count: discoveryResult.result_count - candidates.length,
    ledger_imported: false,
    candidates
  };
}

function runCli(args) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log("Usage: node scripts/build-media-review-queue.mjs <gdelt-discovery.json> <media-review-queue.json>");
    return;
  }
  if (args.length !== 2) throw new Error("Expected an input discovery JSON path and an output queue JSON path. Use --help for usage.");
  const inputPath = resolve(args[0]);
  const outputPath = resolve(args[1]);
  if (inputPath === outputPath) throw new Error("Input and output paths must be different.");
  const discoveryResult = JSON.parse(readFileSync(inputPath, "utf8"));
  const queue = buildMediaReviewQueue(discoveryResult);
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = outputPath + ".tmp-" + process.pid;
  try {
    writeFileSync(temporaryPath, JSON.stringify(queue, null, 2) + "\n", { flag: "wx" });
    renameSync(temporaryPath, outputPath);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    throw error;
  }
  console.log("MEDIA REVIEW QUEUE BUILT — " + queue.candidate_count + " candidates; " + queue.duplicate_count + " duplicate URLs excluded; no evidence imported.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error("MEDIA REVIEW QUEUE ERROR — " + error.message);
    process.exitCode = 1;
  }
}
