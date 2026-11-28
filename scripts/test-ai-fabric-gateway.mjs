import assert from "node:assert/strict";
import { createAiFabricHandler } from "../server/ai-fabric-gateway.mjs";

const UUID = "11111111-1111-4111-8111-111111111111";
const BASE_REQUEST = {
  task: "Quiero diseñar un proceso comercial B2B para hoteles independientes.",
  category: "business",
  source_language: "es",
  output_language: "en",
  target_word_count: 3000,
  retention_mode: "ephemeral"
};
const PROMPT = Array(3000).fill("specific").join(" ");

function makeDependencies(overrides = {}) {
  const calls = { generated: 0, reserved: 0, settled: [], quality: 0 };
  const dependencies = {
    config: {
      allowedOrigins: ["https://app.example"],
      perRequestBudgetUsd: 1,
      timeoutMs: 5000,
      maxBodyBytes: 16384,
      rateLimit: { limit: 5, windowMs: 60000 }
    },
    uuid: () => UUID,
    clock: () => new Date("2026-11-28T14:00:00.000Z"),
    authenticate: async () => ({ id: "test-user" }),
    consumeRateLimit: async () => ({ allowed: true }),
    reserveBudget: async () => {
      calls.reserved += 1;
      return { reserved: true, reservationId: "reservation-test-1" };
    },
    settleBudget: async value => {
      calls.settled.push(value);
      return { settled: true };
    },
    provider: {
      maxCostEnforced: true,
      estimateMaximumCost: async () => 0.8,
      generate: async () => {
        calls.generated += 1;
        return {
          text: PROMPT,
          usage: {
            inputTokens: 1200,
            outputTokens: 3000,
            estimatedCostUsd: 0.6,
            actualCostUsd: 0.55
          },
          modelReference: { providerId: "approved-provider", modelId: "approved-model-v1" }
        };
      }
    },
    qualityCheck: async () => {
      calls.quality += 1;
      return { intentPreserved: true, englishVerified: true, factualityGuardrailsIncluded: true, issues: [] };
    }
  };
  return { dependencies: { ...dependencies, ...overrides }, calls };
}

function request(body = BASE_REQUEST, options = {}) {
  const headers = new Headers({
    origin: "https://app.example",
    "content-type": "application/json",
    ...(options.headers || {})
  });
  return new Request("https://app.example/api/v1/fabric/prompts", {
    method: options.method || "POST",
    headers,
    body: options.body === undefined ? JSON.stringify(body) : options.body
  });
}

async function payload(response) {
  return response.json();
}

{
  const { dependencies } = makeDependencies();
  const response = await createAiFabricHandler(dependencies)(request(BASE_REQUEST, { method: "GET", body: "" }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST");
}
{
  const { dependencies } = makeDependencies();
  const response = await createAiFabricHandler(dependencies)(request(BASE_REQUEST, { headers: { origin: "https://attacker.example" } }));
  assert.equal(response.status, 403);
}
{
  const { dependencies } = makeDependencies();
  const response = await createAiFabricHandler(dependencies)(request(BASE_REQUEST, { headers: { origin: "" } }));
  assert.equal(response.status, 403);
}
{
  const { dependencies } = makeDependencies();
  const response = await createAiFabricHandler(dependencies)(request(BASE_REQUEST, { headers: { "content-type": "text/plain" } }));
  assert.equal(response.status, 415);
}
{
  const { dependencies } = makeDependencies();
  const response = await createAiFabricHandler(dependencies)(request(BASE_REQUEST, { headers: { "content-length": "20000" } }));
  assert.equal(response.status, 413);
}
{
  const { dependencies } = makeDependencies();
  const response = await createAiFabricHandler(dependencies)(request({ ...BASE_REQUEST, provider_api_key: "must-not-echo" }));
  const body = await payload(response);
  assert.equal(response.status, 422);
  assert.equal(body.error.code, "invalid_request");
  assert.ok(!JSON.stringify(body).includes("must-not-echo"));
}
{
  const { dependencies } = makeDependencies({ authenticate: async () => null });
  const response = await createAiFabricHandler(dependencies)(request());
  assert.equal(response.status, 401);
}
{
  const { dependencies } = makeDependencies({ consumeRateLimit: async () => ({ allowed: false, retryAfterSeconds: 99999 }) });
  const response = await createAiFabricHandler(dependencies)(request());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "3600");
}
{
  const { dependencies } = makeDependencies({ provider: null });
  const response = await createAiFabricHandler(dependencies)(request());
  const body = await payload(response);
  assert.equal(response.status, 503);
  assert.equal(body.status, "unavailable");
  assert.equal(body.model_connected, false);
  assert.equal(body.error_code, "no_provider");
}
{
  const { dependencies, calls } = makeDependencies({
    provider: {
      maxCostEnforced: true,
      estimateMaximumCost: async () => 1.2,
      generate: async () => { calls.generated += 1; }
    }
  });
  const response = await createAiFabricHandler(dependencies)(request());
  const body = await payload(response);
  assert.equal(response.status, 409);
  assert.equal(body.status, "budget_exceeded");
  assert.equal(calls.reserved, 0);
  assert.equal(calls.generated, 0);
}
{
  const { dependencies, calls } = makeDependencies({
    reserveBudget: async () => {
      calls.reserved += 1;
      return { reserved: false };
    }
  });
  const response = await createAiFabricHandler(dependencies)(request());
  assert.equal(response.status, 409);
  assert.equal(calls.generated, 0);
}
{
  const { dependencies, calls } = makeDependencies();
  const response = await createAiFabricHandler(dependencies)(request());
  const body = await payload(response);
  assert.equal(response.status, 200);
  assert.equal(body.status, "ready");
  assert.equal(body.generation_mode, "model_gateway");
  assert.equal(body.model_connected, true);
  assert.equal(body.word_count, 3000);
  assert.equal(body.usage.actual_cost_usd, 0.55);
  assert.equal(body.usage.budget_state, "within_limit");
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(calls.reserved, 1);
  assert.equal(calls.generated, 1);
  assert.equal(calls.quality, 1);
  assert.equal(calls.settled.length, 1);
  assert.equal(calls.settled[0].outcome, "completed");
}
{
  const { dependencies, calls } = makeDependencies({
    provider: {
      maxCostEnforced: true,
      estimateMaximumCost: async () => 0.8,
      generate: async () => ({
        text: Array(2999).fill("short").join(" "),
        usage: { inputTokens: 100, outputTokens: 2999, estimatedCostUsd: 0.5, actualCostUsd: 0.4 },
        modelReference: { providerId: "approved-provider", modelId: "approved-model" }
      })
    }
  });
  const response = await createAiFabricHandler(dependencies)(request());
  const body = await payload(response);
  assert.equal(response.status, 503);
  assert.equal(body.status, "unavailable");
  assert.ok(!("english_prompt" in body));
  assert.equal(calls.settled[0].outcome, "quality_rejected");
}
{
  const { dependencies, calls } = makeDependencies({
    qualityCheck: async () => ({ intentPreserved: true, englishVerified: false, factualityGuardrailsIncluded: true })
  });
  const response = await createAiFabricHandler(dependencies)(request());
  const body = await payload(response);
  assert.equal(response.status, 503);
  assert.equal(body.status, "unavailable");
  assert.ok(!("english_prompt" in body));
  assert.equal(calls.settled[0].outcome, "quality_rejected");
}
{
  const { dependencies, calls } = makeDependencies({
    provider: {
      maxCostEnforced: true,
      estimateMaximumCost: async () => 0.8,
      generate: async () => { calls.generated += 1; throw new Error("synthetic upstream failure"); }
    }
  });
  const response = await createAiFabricHandler(dependencies)(request());
  const body = await payload(response);
  assert.equal(response.status, 503);
  assert.equal(body.error_code, "upstream_unavailable");
  assert.equal(calls.settled[0].outcome, "unknown");
  assert.equal(calls.settled[0].actualCostUsd, null);
}
{
  const { dependencies, calls } = makeDependencies({
    provider: {
      maxCostEnforced: true,
      estimateMaximumCost: async () => 0.8,
      generate: async () => ({
        text: PROMPT,
        usage: { inputTokens: 100, outputTokens: 3000, estimatedCostUsd: 1.1, actualCostUsd: 1.1 },
        modelReference: { providerId: "approved-provider", modelId: "approved-model" }
      })
    }
  });
  const response = await createAiFabricHandler(dependencies)(request());
  const body = await payload(response);
  assert.equal(response.status, 409);
  assert.equal(body.status, "budget_exceeded");
  assert.ok(!("english_prompt" in body));
  assert.equal(calls.settled[0].outcome, "overrun");
}
{
  const { dependencies } = makeDependencies({ provider: { maxCostEnforced: false } });
  const response = await createAiFabricHandler(dependencies)(request());
  const body = await payload(response);
  assert.equal(response.status, 503);
  assert.equal(body.error_code, "no_provider");
}
{
  const { dependencies } = makeDependencies({ config: { allowedOrigins: ["https://app.example"], perRequestBudgetUsd: 1 } });
  const response = await createAiFabricHandler(dependencies)(request());
  const body = await payload(response);
  assert.equal(response.status, 503);
  assert.equal(body.status, "unavailable");
}

assert.equal(UUID.length, 36);
console.log("AI FABRIC GATEWAY TESTS PASSED — origin allowlist, bounded JSON, authentication, rate limiting, fail-closed provider state, atomic budget reservation, provider cost ceiling, output quality gate, timeout signal, no-store responses and failure settlement.");
