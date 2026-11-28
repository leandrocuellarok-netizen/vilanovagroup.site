# VILANOVA AI FABRIC — Provider-Neutral API Contract

**Status:** design contract plus an offline, dependency-injected Node gateway core. No hosting route is mounted, no model provider or API key is connected, and no paid account or user account is connected.  
**Review date:** 28 November 2026.  
**Purpose:** define a stable boundary between the Spanish-first interface and a future server-side model gateway without implying that model generation is currently available.

## 1. Endpoint contract

Proposed same-origin endpoint:

    POST /api/v1/fabric/prompts

The browser sends one Spanish request, a selected task category and a target depth. The server owns provider selection, model selection, policy enforcement, rate limits, cost ceilings and all credentials.

The request and response are defined by:

- schemas/ai-fabric-request.schema.json
- schemas/ai-fabric-response.schema.json

The executable server-side core is server/ai-fabric-gateway.mjs. Its framework-neutral handler is not mounted or deployed. See docs/AI-FABRIC-GATEWAY-MVP.md for the dependency contract and remaining production gates.

### Request example

    {
      "task": "Quiero diseñar un proceso de ventas B2B para hoteles independientes.",
      "category": "business",
      "source_language": "es",
      "output_language": "en",
      "target_word_count": 4500,
      "retention_mode": "ephemeral",
      "constraints": ["Argentina", "No invented market data"]
    }

Allowed categories are image, writing, business, report, spreadsheet, automation, research and custom. The custom category handles arbitrary tasks that do not fit a predefined discipline.

The interface accepts a single Spanish sentence or short brief (maximum 1,200 characters). Constraints are optional and limited to 20 short entries. Target depths are exactly 3,000, 4,500 or 6,000 words.

The client cannot submit a provider, model, API key, bearer token, callback URL, tool permission, arbitrary budget or retention override. Unknown properties are rejected.

## 2. Honest response modes

The response contract separates three generation modes:

- prototype_template: a short local blueprint. model_connected must be false and quality.target_attained must be false. The returned word count must remain below the selected target. This is not semantic translation or model-generated reasoning.
- model_gateway: a server-generated English prompt. model_connected must be true, the response must include a non-secret provider/model reference and token/cost usage, and the measured prompt word count must meet the selected target without exceeding 6,000 words.
- none: no prompt is returned. Used for clarification, unavailable service or budget stop conditions.

A ready response must include the exact returned word count. A model gateway response cannot claim target attainment when its measured word count is below the requested depth. A local template cannot claim that it met the production target.

### Response example — local prototype

    {
      "status": "ready",
      "request_id": "11111111-1111-4111-8111-111111111111",
      "generation_mode": "prototype_template",
      "model_connected": false,
      "target_word_count": 3000,
      "response_created_at": "2026-11-28T13:00:00Z",
      "retention_mode": "ephemeral",
      "english_prompt": "A short local prompt blueprint.",
      "word_count": 6,
      "quality": {
        "intent_preserved": true,
        "target_attained": false,
        "factuality_guardrails_included": true
      }
    }

## 3. HTTP and failure semantics

| HTTP status | Meaning | Required behavior |
|---|---|---|
| 200 | Ready or one clarification question | Return schema-valid response; do not fabricate missing inputs |
| 409 | Configured budget ceiling reached | Return budget_exceeded; do not return partial prompt as complete |
| 422 | Invalid request | Return field-level validation errors without echoing secrets |
| 429 | User/global rate limit reached | Include a bounded Retry-After; do not retry indefinitely |
| 503 | No approved provider or upstream unavailable | Return unavailable; retain no prompt and do not fall back to an undisclosed provider |

A clarification response contains exactly one focused question. The client must not send repeated requests automatically when a user decision is required.

## 4. Security and privacy boundary

1. Server-side secrets only. Provider API keys belong in a server secret manager or protected runtime environment. Never include keys in HTML, browser JavaScript, source maps, static JSON, client storage, logs or error payloads.
2. Provider allowlist. The gateway selects only an explicitly configured provider/model pair. The browser cannot select arbitrary upstream endpoints or submit model names.
3. Authentication and request integrity. Use same-origin authenticated sessions, secure HttpOnly cookies, CSRF protection where cookie authentication is used, strict CORS and authorization checks.
4. Input limits. Enforce the 1,200-character task limit, bounded constraints, JSON content type, request-body size, output-token ceiling, timeout and concurrency cap on the server. Browser validation is only a convenience.
5. Prompt injection. Treat user text and any future uploaded material as untrusted data. Source content cannot override system policy, provider allowlists or tool permissions. No external tools are enabled by this contract.
6. Output handling. Return plain text, render it as text rather than HTML, and never execute generated markup or code in the browser.
7. Ephemeral by default. The request requires retention_mode: ephemeral. Do not persist raw prompts or generated content by default. Define an explicit retention policy before adding history or analytics.
8. Minimal audit. Retain only operational metadata needed for abuse prevention and cost reconciliation: request ID, timestamp, selected category/depth, model reference, token usage, budget state and validation outcome. Redact prompt content, credentials and sensitive personal data.

## 5. Cost and abuse controls

All monetary limits are server-side configuration, not client input.

- Set a hard per-request USD ceiling and a monthly/global ceiling before enabling a provider.
- Estimate cost from the selected model and requested output size before generation where pricing data is available.
- Reserve budget atomically before dispatch so concurrent requests cannot overspend the same balance.
- Enforce input/output token ceilings, per-user and per-IP rate limits, concurrency limits and upstream timeouts.
- Support cancellation; stop generation when the user cancels or the configured ceiling is reached.
- Record estimated and actual cost when the provider exposes reliable usage data. Do not invent missing usage.
- Keep automatic credit purchases, auto-recharge and paid account creation disabled. A provider pilot requires explicit authorization and a written spend cap.

## 6. Quality gates

A production response must pass:

- Spanish intent preservation for names, dates, amounts, locations and exclusions.
- Category-specific structure, including the custom arbitrary-task framework.
- English terminology and readable professional syntax.
- No invented facts, citations, metrics, approvals, partnerships or capabilities.
- No repetitive padding to reach the target.
- Exact word-count reconciliation against the returned text.
- Explicit assumptions and one clarification question when a material input is missing.
- A critic/validator pass before the response is marked ready.

A 3,000–6,000-word target is a length constraint, not permission to add generic filler. If the available context cannot support a useful prompt, ask for one material clarification rather than inventing details.

## 7. Offline test coverage and current limitation

Run:

    node scripts/test-ai-fabric-contract.mjs
    node scripts/test-fabric-prompt.mjs
    node scripts/test-ai-fabric-gateway.mjs

The contract regression test checks schema structure and critical cross-field invariants using Node.js built-ins. The gateway suite exercises the handler with synthetic dependencies and no network calls. Neither test is a general-purpose JSON Schema implementation or a substitute for review of a production identity, budget, provider or hosting adapter.

The gateway core is executable but not deployed. No backend or model is configured; no backend route is mounted or deployed. These files do not connect an AI provider, perform semantic translation, generate a production-length prompt or authorize paid usage.
