import { randomUUID } from "node:crypto";

const REQUEST_KEYS = new Set([
  "task",
  "category",
  "source_language",
  "output_language",
  "target_word_count",
  "retention_mode",
  "client_request_id",
  "constraints"
]);
const CATEGORIES = new Set(["image", "writing", "business", "report", "spreadsheet", "automation", "research", "custom"]);
const DEPTHS = new Set([3000, 4500, 6000]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "pragma": "no-cache",
      "x-content-type-options": "nosniff",
      ...extraHeaders
    }
  });
}

function apiError(status, code, requestId, extra = {}, headers = {}) {
  return jsonResponse({ error: { code, request_id: requestId, ...extra } }, status, headers);
}

function nowIso(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid gateway clock");
  return date.toISOString();
}

function contractFailure(status, requestId, targetWordCount, errorCode, clock) {
  return jsonResponse({
    status,
    request_id: requestId,
    generation_mode: "none",
    model_connected: false,
    target_word_count: DEPTHS.has(targetWordCount) ? targetWordCount : 3000,
    response_created_at: nowIso(clock),
    retention_mode: "ephemeral",
    error_code: errorCode
  }, status === "budget_exceeded" ? 409 : 503);
}

function validateRequest(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, issues: [{ field: "$", code: "object_required" }] };
  }
  for (const key of Object.keys(value)) {
    if (!REQUEST_KEYS.has(key)) issues.push({ field: key, code: "unknown_property" });
  }
  for (const key of ["task", "category", "source_language", "output_language", "target_word_count", "retention_mode"]) {
    if (!(key in value)) issues.push({ field: key, code: "required" });
  }
  if (typeof value.task !== "string" || !value.task.trim() || value.task.length > 1200) {
    issues.push({ field: "task", code: "invalid_length" });
  }
  if (!CATEGORIES.has(value.category)) issues.push({ field: "category", code: "unsupported_value" });
  if (value.source_language !== "es") issues.push({ field: "source_language", code: "unsupported_value" });
  if (value.output_language !== "en") issues.push({ field: "output_language", code: "unsupported_value" });
  if (!DEPTHS.has(value.target_word_count)) issues.push({ field: "target_word_count", code: "unsupported_value" });
  if (value.retention_mode !== "ephemeral") issues.push({ field: "retention_mode", code: "unsupported_value" });
  if (value.client_request_id !== undefined && (typeof value.client_request_id !== "string" || !UUID_PATTERN.test(value.client_request_id))) {
    issues.push({ field: "client_request_id", code: "invalid_uuid" });
  }
  if (value.constraints !== undefined) {
    if (!Array.isArray(value.constraints) || value.constraints.length > 20) {
      issues.push({ field: "constraints", code: "invalid_array_size" });
    } else {
      if (new Set(value.constraints).size !== value.constraints.length) {
        issues.push({ field: "constraints", code: "duplicate_items" });
      }
      value.constraints.forEach((item, index) => {
        if (typeof item !== "string" || !item.trim() || item.length > 500) {
          issues.push({ field: "constraints[" + index + "]", code: "invalid_length" });
        }
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

async function readBoundedBody(request, maxBytes) {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared)) throw new Error("invalid_content_length");
    if (Number(declared) > maxBytes) throw new Error("body_too_large");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("body_too_large");
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("invalid_utf8");
  }
}

function countWords(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/u).filter(Boolean).length : 0;
}

function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createAiFabricHandler(dependencies = {}) {
  const config = dependencies.config || {};
  const clock = dependencies.clock || (() => new Date());
  const makeId = dependencies.uuid || randomUUID;
  const maxBodyBytes = Number.isSafeInteger(config.maxBodyBytes) && config.maxBodyBytes > 0
    ? Math.min(config.maxBodyBytes, 65536)
    : 16384;
  const timeoutMs = Number.isSafeInteger(config.timeoutMs) && config.timeoutMs > 0
    ? Math.min(config.timeoutMs, 120000)
    : 60000;
  const rateLimit = config.rateLimit || { limit: 5, windowMs: 60000 };

  return async function handleAiFabricRequest(request) {
    const candidateId = makeId();
    const requestId = typeof candidateId === "string" && UUID_PATTERN.test(candidateId) ? candidateId : randomUUID();

    if (request.method !== "POST") {
      return apiError(405, "method_not_allowed", requestId, {}, { allow: "POST" });
    }

    if (!Array.isArray(config.allowedOrigins) || config.allowedOrigins.length === 0) {
      return contractFailure("unavailable", requestId, 3000, "no_provider", clock);
    }

    const origin = request.headers.get("origin");
    let parsedOrigin;
    try {
      parsedOrigin = origin ? new URL(origin) : null;
    } catch {
      parsedOrigin = null;
    }
    const allowedOrigins = config.allowedOrigins.filter(value => {
      try {
        const parsed = new URL(value);
        return parsed.origin === value && (parsed.protocol === "https:" || parsed.hostname === "localhost");
      } catch {
        return false;
      }
    });
    if (!parsedOrigin || parsedOrigin.origin !== origin || !allowedOrigins.includes(parsedOrigin.origin)) {
      return apiError(403, "origin_not_allowed", requestId);
    }

    const contentType = request.headers.get("content-type") || "";
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
      return apiError(415, "json_content_type_required", requestId);
    }

    let rawBody;
    try {
      rawBody = await readBoundedBody(request, maxBodyBytes);
    } catch (error) {
      const code = error?.message || "invalid_body";
      const status = code === "body_too_large" ? 413 : 400;
      return apiError(status, code, requestId);
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return apiError(400, "invalid_json", requestId);
    }

    const validation = validateRequest(payload);
    if (!validation.ok) {
      return apiError(422, "invalid_request", requestId, { issues: validation.issues });
    }

    if (typeof dependencies.authenticate !== "function" ||
        typeof dependencies.consumeRateLimit !== "function" ||
        typeof dependencies.reserveBudget !== "function" ||
        typeof dependencies.settleBudget !== "function") {
      return contractFailure("unavailable", requestId, payload.target_word_count, "no_provider", clock);
    }

    let principal;
    try {
      principal = await dependencies.authenticate(request);
    } catch {
      return apiError(503, "authentication_unavailable", requestId);
    }
    if (!principal || typeof principal.id !== "string" || !principal.id.trim()) {
      return apiError(401, "authentication_required", requestId);
    }

    let rateResult;
    try {
      rateResult = await dependencies.consumeRateLimit({
        principalId: principal.id,
        requestId,
        limit: Number.isSafeInteger(rateLimit.limit) ? rateLimit.limit : 5,
        windowMs: Number.isSafeInteger(rateLimit.windowMs) ? rateLimit.windowMs : 60000
      });
    } catch {
      return apiError(503, "rate_limiter_unavailable", requestId);
    }
    if (rateResult !== true && rateResult?.allowed !== true) {
      if (rateResult === false || rateResult?.allowed === false) {
        const retryAfter = Math.max(1, Math.min(3600, Number(rateResult?.retryAfterSeconds) || 60));
        return apiError(429, "rate_limited", requestId, {}, { "retry-after": String(retryAfter) });
      }
      return apiError(503, "rate_limiter_invalid_response", requestId);
    }

    const ceilingUsd = config.perRequestBudgetUsd;
    if (!isNonNegativeNumber(ceilingUsd) || ceilingUsd <= 0 ||
        !dependencies.provider ||
        dependencies.provider.maxCostEnforced !== true ||
        typeof dependencies.provider.estimateMaximumCost !== "function" ||
        typeof dependencies.provider.generate !== "function" ||
        typeof dependencies.qualityCheck !== "function") {
      return contractFailure("unavailable", requestId, payload.target_word_count, "no_provider", clock);
    }

    let maximumCostUsd;
    try {
      maximumCostUsd = await dependencies.provider.estimateMaximumCost({ request: payload });
    } catch {
      return contractFailure("unavailable", requestId, payload.target_word_count, "upstream_unavailable", clock);
    }
    if (!isNonNegativeNumber(maximumCostUsd)) {
      return contractFailure("unavailable", requestId, payload.target_word_count, "upstream_unavailable", clock);
    }
    if (maximumCostUsd > ceilingUsd) {
      return contractFailure("budget_exceeded", requestId, payload.target_word_count, "budget_ceiling", clock);
    }

    let reservation;
    try {
      reservation = await dependencies.reserveBudget({
        principalId: principal.id,
        requestId,
        clientRequestId: payload.client_request_id || null,
        amountUsd: maximumCostUsd,
        ceilingUsd
      });
    } catch {
      return contractFailure("unavailable", requestId, payload.target_word_count, "upstream_unavailable", clock);
    }
    if (!reservation || reservation.reserved !== true || typeof reservation.reservationId !== "string" || !reservation.reservationId.trim()) {
      return contractFailure("budget_exceeded", requestId, payload.target_word_count, "budget_ceiling", clock);
    }

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
    let generated;
    try {
      generated = await dependencies.provider.generate({
        request: payload,
        requestId,
        signal,
        maxCostUsd: ceilingUsd
      });
    } catch {
      try {
        await dependencies.settleBudget({
          reservationId: reservation.reservationId,
          requestId,
          actualCostUsd: null,
          outcome: "unknown"
        });
      } catch {
        // Keep the reservation unresolved for reconciliation; never release an unknown charge.
      }
      return contractFailure("unavailable", requestId, payload.target_word_count, "upstream_unavailable", clock);
    }

    const text = typeof generated?.text === "string" ? generated.text.trim() : "";
    const usage = generated?.usage || {};
    const modelReference = generated?.modelReference || {};
    const reportedActualCostUsd = usage.actualCostUsd;
    const actualCostUsd = reportedActualCostUsd === null || reportedActualCostUsd === undefined
      ? null
      : isNonNegativeNumber(reportedActualCostUsd) ? reportedActualCostUsd : null;
    const actualCostFieldIsValid = reportedActualCostUsd === null || reportedActualCostUsd === undefined ||
      isNonNegativeNumber(reportedActualCostUsd);
    const usageIsValid =
      isNonNegativeInteger(usage.inputTokens) &&
      isNonNegativeInteger(usage.outputTokens) &&
      isNonNegativeNumber(usage.estimatedCostUsd) &&
      actualCostFieldIsValid;
    const modelReferenceIsValid =
      typeof modelReference.providerId === "string" &&
      PROVIDER_ID_PATTERN.test(modelReference.providerId) &&
      typeof modelReference.modelId === "string" &&
      modelReference.modelId.trim().length > 0 &&
      modelReference.modelId.length <= 120;

    if (!text || !usageIsValid || !modelReferenceIsValid) {
      try {
        await dependencies.settleBudget({
          reservationId: reservation.reservationId,
          requestId,
          actualCostUsd,
          outcome: "invalid_provider_response"
        });
      } catch {
        // Keep the reservation unresolved for reconciliation.
      }
      return contractFailure("unavailable", requestId, payload.target_word_count, "upstream_unavailable", clock);
    }

    if (usage.estimatedCostUsd > ceilingUsd || (actualCostUsd !== null && actualCostUsd > ceilingUsd)) {
      try {
        await dependencies.settleBudget({
          reservationId: reservation.reservationId,
          requestId,
          actualCostUsd,
          outcome: "overrun"
        });
      } catch {
        // The budget incident remains unresolved and must be reconciled.
      }
      return contractFailure("budget_exceeded", requestId, payload.target_word_count, "budget_ceiling", clock);
    }

    let quality;
    try {
      quality = await dependencies.qualityCheck({
        request: payload,
        output: text,
        signal
      });
    } catch {
      quality = null;
    }
    const wordCount = countWords(text);
    const qualityPassed =
      quality?.intentPreserved === true &&
      quality?.englishVerified === true &&
      quality?.factualityGuardrailsIncluded === true &&
      wordCount >= payload.target_word_count &&
      wordCount <= 6000;

    let settlement;
    try {
      settlement = await dependencies.settleBudget({
        reservationId: reservation.reservationId,
        requestId,
        actualCostUsd,
        outcome: qualityPassed ? (actualCostUsd === null ? "pending_reconciliation" : "completed") : "quality_rejected"
      });
    } catch {
      settlement = null;
    }
    if (!settlement || settlement.settled !== true) {
      return contractFailure("unavailable", requestId, payload.target_word_count, "upstream_unavailable", clock);
    }
    if (!qualityPassed) {
      return contractFailure("unavailable", requestId, payload.target_word_count, "upstream_unavailable", clock);
    }

    const issues = Array.isArray(quality.issues)
      ? quality.issues.filter(item => typeof item === "string").slice(0, 10).map(item => item.slice(0, 300))
      : [];
    return jsonResponse({
      status: "ready",
      request_id: requestId,
      generation_mode: "model_gateway",
      model_connected: true,
      target_word_count: payload.target_word_count,
      response_created_at: nowIso(clock),
      retention_mode: "ephemeral",
      english_prompt: text,
      word_count: wordCount,
      quality: {
        intent_preserved: true,
        target_attained: true,
        factuality_guardrails_included: true,
        issues
      },
      model_reference: {
        provider_id: modelReference.providerId,
        model_id: modelReference.modelId
      },
      usage: {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        estimated_cost_usd: usage.estimatedCostUsd,
        actual_cost_usd: actualCostUsd,
        budget_ceiling_usd: ceilingUsd,
        budget_state: "within_limit"
      }
    }, 200);
  };
}

export { countWords, validateRequest };
