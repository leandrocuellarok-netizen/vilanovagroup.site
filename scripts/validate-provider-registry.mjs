import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SECRET_FIELD = /(api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|private[_-]?key)/i;
const CONNECTION_STATES = new Set(["not_connected", "manual_only", "connected"]);

function walkForSecrets(value, path = "registry") {
  const errors = [];
  if (!value || typeof value !== "object") return errors;
  for (const [key, child] of Object.entries(value)) {
    const nextPath = path + "." + key;
    if (SECRET_FIELD.test(key)) errors.push(nextPath + " must not contain credentials or secret material");
    errors.push(...walkForSecrets(child, nextPath));
  }
  return errors;
}

export function validateProviderRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) return ["registry must be an object"];
  if (registry.schema_version !== "1.0.0") errors.push("schema_version must be 1.0.0");
  if (!Number.isFinite(Date.parse(registry.reviewed_at ?? ""))) errors.push("reviewed_at must be a valid timestamp");
  if (!Array.isArray(registry.providers) || registry.providers.length === 0) errors.push("providers must be a non-empty array");

  const ids = new Set();
  for (const [index, provider] of (registry.providers ?? []).entries()) {
    const label = "providers[" + index + "]";
    if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
      errors.push(label + " must be an object");
      continue;
    }
    for (const field of ["provider_id", "provider_name", "product_name", "integration_stage", "connection_status", "commercial_use", "authentication"]) {
      if (typeof provider[field] !== "string" || !provider[field].trim()) errors.push(label + "." + field + " is required");
    }
    if (provider.provider_id) {
      if (ids.has(provider.provider_id)) errors.push("duplicate provider_id: " + provider.provider_id);
      ids.add(provider.provider_id);
    }
    if (!CONNECTION_STATES.has(provider.connection_status)) errors.push(label + ".connection_status is not supported");
    for (const field of ["capabilities", "known_constraints", "official_sources"]) {
      if (!Array.isArray(provider[field]) || provider[field].length === 0) errors.push(label + "." + field + " must be a non-empty array");
    }
    for (const [sourceIndex, source] of (provider.official_sources ?? []).entries()) {
      let parsed;
      try { parsed = new URL(source.url); } catch { parsed = null; }
      if (!parsed || parsed.protocol !== "https:") errors.push(label + ".official_sources[" + sourceIndex + "] must use an HTTPS URL");
      if (!source.title || !source.checked_at || !Number.isFinite(Date.parse(source.checked_at))) {
        errors.push(label + ".official_sources[" + sourceIndex + "] requires title and valid checked_at");
      }
    }
    if (provider.commercial_product_eligible === false && provider.connection_status === "connected") {
      errors.push(label + " is not eligible for the commercial product and cannot be connected");
    }
    if (provider.connection_status === "connected") {
      const approval = provider.authorization_record;
      if (!approval || !approval.approved_by || !approval.approved_at || !approval.scope) {
        errors.push(label + " connected state requires an authorization_record with approver, timestamp and scope");
      }
      if (provider.commercial_commitment_required && !provider.commercial_approval?.reference) {
        errors.push(label + " requires a recorded commercial approval before connection");
      }
      if (provider.user_authorization_required && !provider.user_authorization?.scope) {
        errors.push(label + " requires explicit user authorization scope before connection");
      }
      if (provider.spend_controls_required && provider.spend_limit_configured !== true) {
        errors.push(label + " requires a configured spend limit before connection");
      }
    } else if (provider.last_successful_sync) {
      errors.push(label + " cannot claim a successful sync while not connected or manual-only");
    }
  }
  errors.push(...walkForSecrets(registry));
  return [...new Set(errors)];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = new URL("../data/provider-capabilities.json", import.meta.url);
  const registry = JSON.parse(readFileSync(path, "utf8"));
  const errors = validateProviderRegistry(registry);
  if (errors.length) {
    console.error("PROVIDER REGISTRY INVALID\n- " + errors.join("\n- "));
    process.exitCode = 1;
  } else {
    console.log("VILANOVA PROVIDER REGISTRY VALID — " + registry.providers.length + " routes; no live connections or credentials; commercial eligibility and permission gates preserved.");
  }
}