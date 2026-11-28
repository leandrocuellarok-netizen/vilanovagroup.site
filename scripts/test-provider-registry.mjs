import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateProviderRegistry } from "./validate-provider-registry.mjs";

const registry = JSON.parse(readFileSync(new URL("../data/provider-capabilities.json", import.meta.url), "utf8"));
assert.deepEqual(validateProviderRegistry(registry), [], "The provider registry must pass its contract checks");
assert.equal(registry.providers.every(provider => provider.connection_status !== "connected"), true,
  "No provider may be presented as connected without explicit authorization");
assert.equal(registry.providers.find(provider => provider.provider_id === "tiktok-research-api").commercial_product_eligible, false,
  "TikTok Research API must remain excluded from the commercial product");
assert.equal(registry.providers.find(provider => provider.provider_id === "meta-content-library-api").commercial_product_eligible, false,
  "Meta Content Library must remain restricted to qualifying research access");

const duplicate = structuredClone(registry);
duplicate.providers.push(structuredClone(duplicate.providers[0]));
assert.ok(validateProviderRegistry(duplicate).some(error => error.includes("duplicate provider_id")));

const unauthorized = structuredClone(registry);
const x = unauthorized.providers.find(provider => provider.provider_id === "x-api-v2");
x.connection_status = "connected";
assert.ok(validateProviderRegistry(unauthorized).some(error => error.includes("authorization_record")));
assert.ok(validateProviderRegistry(unauthorized).some(error => error.includes("commercial approval")));
assert.ok(validateProviderRegistry(unauthorized).some(error => error.includes("spend limit")));

const ineligible = structuredClone(registry);
const tiktok = ineligible.providers.find(provider => provider.provider_id === "tiktok-research-api");
tiktok.connection_status = "connected";
assert.ok(validateProviderRegistry(ineligible).some(error => error.includes("not eligible for the commercial product")));

const leaked = structuredClone(registry);
leaked.providers[0].api_key = "synthetic-secret-must-never-be-stored";
assert.ok(validateProviderRegistry(leaked).some(error => error.includes("api_key")));

const insecure = structuredClone(registry);
insecure.providers[0].official_sources[0].url = "http://example.org/source";
assert.ok(validateProviderRegistry(insecure).some(error => error.includes("HTTPS URL")));

const falseSync = structuredClone(registry);
falseSync.providers[0].last_successful_sync = "2026-11-28T08:00:00Z";
assert.ok(validateProviderRegistry(falseSync).some(error => error.includes("successful sync")));

console.log("VILANOVA PROVIDER REGISTRY TESTS PASSED — unique providers, HTTPS source evidence, commercial restrictions, no false connection state, approval and spend-limit gates, no credentials and no false sync claims.");