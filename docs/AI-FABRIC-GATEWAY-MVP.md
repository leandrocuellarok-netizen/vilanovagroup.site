# VILANOVA AI FABRIC — Offline Gateway Core

**Status:** dependency-injected server module implemented and regression-tested; not mounted on a hosting platform, not deployed, and not connected to a model provider.  
**Runtime target:** Node.js 22 with the built-in Fetch API.  
**Review date:** 28 November 2026.

## Purpose

The gateway core turns the existing request/response contract into an executable server-side boundary. It is framework-neutral: a future Node-compatible route can call the exported handler, but this repository does not currently define a production hosting runtime or authentication store.

Implementation: server/ai-fabric-gateway.mjs  
Regression suite: scripts/test-ai-fabric-gateway.mjs

## Request lifecycle

1. Accept POST only.
2. Require an exact configured HTTPS origin (localhost may be explicitly allowed for development).
3. Require application/json and enforce a streaming body-size limit before parsing.
4. Reject unknown properties and validate the Spanish-to-English request contract.
5. Authenticate the principal and apply a server-side rate limit.
6. Require a provider adapter that explicitly declares max-cost enforcement.
7. Estimate the maximum request cost and reject it before dispatch if it exceeds the server-side per-request ceiling.
8. Atomically reserve the estimated maximum against the user's/global budget.
9. Call the provider with an AbortSignal timeout and a server-owned maximum cost. The provider adapter owns its secret and must enforce its own output-token ceiling.
10. Run a deterministic local quality gate for intent preservation, English output and factuality guardrails.
11. Reconcile the budget reservation before returning the prompt. A missing actual-cost figure remains pending reconciliation; an unknown upstream outcome is not silently released.
12. Return a no-store response. No prompt content is written to logs or persisted by this module.

## Dependency contract

The route supplies these server-only dependencies:

- authenticate(request) returns a principal with a stable internal id or null.
- consumeRateLimit({ principalId, requestId, limit, windowMs }) must be atomic across concurrent requests.
- reserveBudget({ principalId, requestId, clientRequestId, amountUsd, ceilingUsd }) atomically reserves the maximum estimated cost.
- settleBudget({ reservationId, requestId, actualCostUsd, outcome }) reconciles a completed, rejected, failed or unknown request. Unknown charges must remain held for reconciliation.
- provider.maxCostEnforced must be true.
- provider.estimateMaximumCost({ request }) returns a finite non-negative USD maximum.
- provider.generate({ request, requestId, signal, maxCostUsd }) returns plain text, token/cost usage and a non-secret model reference. Provider credentials remain inside the adapter.
- qualityCheck({ request, output, signal }) is a deterministic local check. A paid model-based critic must be separately costed and included in the budget reservation before it is enabled.

The module deliberately has no default authentication, database, budget store, provider, secret, or network client. Missing security dependencies fail closed. The per-request budget ceiling and origin allowlist are server configuration; neither is accepted from the browser.

## HTTP behavior

- 200: schema-shaped ready response only after the selected word target, quality gate and budget settlement pass.
- 400 / 413 / 415: malformed JSON, oversized body or wrong content type.
- 401 / 403: missing authenticated principal or unapproved origin.
- 409: budget reservation or maximum-cost check fails; no prompt is returned.
- 422: request validation fails; errors contain field names and codes, never submitted values.
- 429: rate limit reached with a bounded Retry-After header.
- 503: provider, authentication, budget store or upstream is unavailable. No prototype fallback is silently substituted.

Every response is marked no-store and nosniff. Non-ready contract responses never include an English prompt.

## Safety and production gaps

This is an executable core, not a deployed API. Before mounting it, implement and review:

- a real authentication/session provider and CSRF/session policy;
- an atomic shared rate-limit store;
- a transactional budget ledger with reservation expiry and reconciliation;
- a provider adapter with a documented hard token/cost cap and server-only secret storage;
- deterministic language/factuality/intent validators and an operational incident path for provider overruns;
- hosting-specific request-size, timeout, concurrency and logging controls;
- privacy, retention, abuse and data-processing review.

No provider has been selected or connected. No API key, account, paid service, user data store or production deployment was created. The existing static interface remains an honestly labelled local prototype.

## Test

Run:

    node scripts/test-ai-fabric-gateway.mjs
    node scripts/test-ai-fabric-contract.mjs

The gateway suite uses synthetic dependencies and makes no network calls. It verifies fail-closed behavior; it does not prove the behavior of a real provider, database, identity service or hosting platform.
