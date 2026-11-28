import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CATEGORIES = new Set(["creator","journalist","presenter","streamer","public_figure","media_personality"]);
const PROFILE_STATUSES = new Set(["provisional","verified","disputed","inactive"]);
const IDENTITY_STATUSES = new Set(["verified","claimed","unverified","disputed"]);
const METHODS = new Set(["platform_badge","cross_linked_official_site","official_publication","self_declared","unknown"]);
const SOURCE_TYPES = new Set(["official_site","platform_profile","platform_badge","public_document","news_report","other"]);
const TRUSTED_IDENTITY_METHODS = new Set(["platform_badge","cross_linked_official_site","official_publication"]);
const TRUSTED_SOURCE_TYPES = new Set(["official_site","platform_badge","public_document"]);

function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isDateTime(value) {
  return typeof value === "string" &&
    /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}
function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try { const u = new URL(value); return u.protocol === "https:" && Boolean(u.hostname); }
  catch { return false; }
}
function normalizedUrl(value) {
  try { const u = new URL(value); u.hash = ""; u.search = ""; u.hostname = u.hostname.toLowerCase(); const result = u.toString(); return result.endsWith("/") ? result.slice(0, -1) : result; }
  catch { return value; }
}
function requireText(value, path, errors, max = 1000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    errors.push(path + " must be a non-empty string of at most " + max + " characters");
}
function onlyKeys(value, allowed, path, errors) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(path + "." + key + " is not an allowed field");
}
function validateSource(source, path, errors, now) {
  if (!isObject(source)) { errors.push(path + " must be an object"); return; }
  onlyKeys(source, new Set(["publisher","url","source_type","published_at","captured_at","claim_supported"]), path, errors);
  requireText(source.publisher, path + ".publisher", errors, 300);
  if (!isHttpsUrl(source.url)) errors.push(path + ".url must be an HTTPS URL");
  if (!SOURCE_TYPES.has(source.source_type)) errors.push(path + ".source_type is unsupported");
  if (!isDateTime(source.captured_at)) errors.push(path + ".captured_at must be an ISO 8601 timestamp with timezone");
  if (isDateTime(source.captured_at) && Date.parse(source.captured_at) > now)
    errors.push(path + ".captured_at cannot be in the future");
  if (source.published_at !== undefined && !isDateTime(source.published_at))
    errors.push(path + ".published_at must be an ISO 8601 timestamp with timezone");
  if (isDateTime(source.published_at) && isDateTime(source.captured_at) &&
      Date.parse(source.published_at) > Date.parse(source.captured_at))
    errors.push(path + ".published_at cannot be later than captured_at");
  requireText(source.claim_supported, path + ".claim_supported", errors, 1000);
}
function validateProfile(profile, index, now) {
  const errors = [], path = "profiles[" + index + "]";
  if (!isObject(profile)) return [path + " must be an object"];
  const allowed = new Set(["profile_id","display_name","category","country_code","status","aliases","public_profiles","evidence","created_at","updated_at","last_reviewed_at"]);
  onlyKeys(profile, allowed, path, errors);
  if (typeof profile.profile_id !== "string" || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(profile.profile_id))
    errors.push(path + ".profile_id must be a stable lowercase identifier (3–80 characters)");
  requireText(profile.display_name, path + ".display_name", errors, 200);
  if (!CATEGORIES.has(profile.category)) errors.push(path + ".category is unsupported");
  if (profile.country_code !== "AR") errors.push(path + ".country_code must be AR for this Argentina directory");
  if (!PROFILE_STATUSES.has(profile.status)) errors.push(path + ".status is unsupported");
  if (profile.aliases !== undefined) {
    if (!Array.isArray(profile.aliases)) errors.push(path + ".aliases must be an array");
    else {
      const seenAliases = new Set();
      profile.aliases.forEach((alias, i) => {
        requireText(alias, path + ".aliases[" + i + "]", errors, 150);
        if (typeof alias === "string") {
          const key = alias.trim().toLowerCase();
          if (seenAliases.has(key)) errors.push(path + ".aliases contains a duplicate: " + alias);
          seenAliases.add(key);
        }
      });
    }
  }
  if (!Array.isArray(profile.public_profiles) || profile.public_profiles.length === 0) {
    errors.push(path + ".public_profiles must contain at least one public profile");
  } else {
    profile.public_profiles.forEach((item, i) => {
      const p = path + ".public_profiles[" + i + "]";
      if (!isObject(item)) { errors.push(p + " must be an object"); return; }
      onlyKeys(item, new Set(["platform","handle","url","identity_status","verification_method","source"]), p, errors);
      requireText(item.platform, p + ".platform", errors, 100);
      requireText(item.handle, p + ".handle", errors, 150);
      if (!isHttpsUrl(item.url)) errors.push(p + ".url must be an HTTPS URL");
      if (!IDENTITY_STATUSES.has(item.identity_status)) errors.push(p + ".identity_status is unsupported");
      if (!METHODS.has(item.verification_method)) errors.push(p + ".verification_method is unsupported");
      if (item.identity_status === "verified" && !TRUSTED_IDENTITY_METHODS.has(item.verification_method))
        errors.push(p + ".verified identity requires a platform badge, official-site cross-link or official publication");
      validateSource(item.source, p + ".source", errors, now);
    });
  }
  if (!Array.isArray(profile.evidence) || profile.evidence.length === 0) {
    errors.push(path + ".evidence must contain at least one source");
  } else profile.evidence.forEach((source, i) => validateSource(source, path + ".evidence[" + i + "]", errors, now));

  for (const key of ["created_at","updated_at","last_reviewed_at"]) {
    if (!isDateTime(profile[key])) errors.push(path + "." + key + " must be an ISO 8601 timestamp with timezone");
    else if (Date.parse(profile[key]) > now) errors.push(path + "." + key + " cannot be in the future");
  }
  if (isDateTime(profile.created_at) && isDateTime(profile.updated_at) && Date.parse(profile.updated_at) < Date.parse(profile.created_at))
    errors.push(path + ".updated_at cannot precede created_at");
  if (isDateTime(profile.created_at) && isDateTime(profile.last_reviewed_at) && Date.parse(profile.last_reviewed_at) < Date.parse(profile.created_at))
    errors.push(path + ".last_reviewed_at cannot precede created_at");
  if (isDateTime(profile.updated_at) && isDateTime(profile.last_reviewed_at) && Date.parse(profile.updated_at) < Date.parse(profile.last_reviewed_at))
    errors.push(path + ".updated_at cannot precede last_reviewed_at");

  if (profile.status === "verified") {
    const hasVerifiedPublicIdentity = Array.isArray(profile.public_profiles) && profile.public_profiles.some(p =>
      isObject(p) && p.identity_status === "verified" && TRUSTED_IDENTITY_METHODS.has(p.verification_method));
    const hasOfficialEvidence = Array.isArray(profile.evidence) && profile.evidence.some(s =>
      isObject(s) && TRUSTED_SOURCE_TYPES.has(s.source_type));
    if (!hasVerifiedPublicIdentity || !hasOfficialEvidence)
      errors.push(path + ".verified status requires a verified public identity and official supporting evidence");
  }
  return errors;
}

export function validateProfileDirectory(directory, options = {}) {
  const errors = [];
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  if (!Number.isFinite(now)) throw new Error("options.now must be a valid date");
  if (!isObject(directory)) return ["directory must be an object"];
  onlyKeys(directory, new Set(["schema_version","profiles"]), "directory", errors);
  if (directory.schema_version !== "1.0.0") errors.push("directory.schema_version must equal 1.0.0");
  if (!Array.isArray(directory.profiles)) return errors.concat("directory.profiles must be an array");

  const ids = new Set(), profileUrls = new Map(), handles = new Map();
  directory.profiles.forEach((profile, index) => {
    errors.push(...validateProfile(profile, index, now));
    if (!isObject(profile)) return;
    if (typeof profile.profile_id === "string") {
      if (ids.has(profile.profile_id)) errors.push("duplicate profile_id: " + profile.profile_id);
      ids.add(profile.profile_id);
    }
    if (!Array.isArray(profile.public_profiles)) return;
    for (const item of profile.public_profiles) {
      if (!isObject(item)) continue;
      if (typeof item.url === "string" && isHttpsUrl(item.url)) {
        const key = normalizedUrl(item.url);
        if (profileUrls.has(key)) errors.push("duplicate public profile URL: " + key);
        else profileUrls.set(key, profile.profile_id);
      }
      if (typeof item.platform === "string" && typeof item.handle === "string") {
        const key = item.platform.trim().toLowerCase() + ":" + item.handle.trim().replace(/^@/, "").toLowerCase();
        if (handles.has(key)) errors.push("duplicate platform handle: " + key);
        else handles.set(key, profile.profile_id);
      }
    }
  });
  return errors;
}

function run() {
  let directory;
  try { directory = JSON.parse(readFileSync(resolve(process.cwd(), "data/influencer-profiles.json"), "utf8")); }
  catch (error) { console.error("Unable to read public influencer directory:", error.message); process.exitCode = 1; return; }
  const errors = validateProfileDirectory(directory);
  if (errors.length) {
    console.error("PUBLIC INFLUENCER DIRECTORY VALIDATION FAILED");
    for (const error of errors) console.error(" - " + error);
    process.exitCode = 1;
    return;
  }
  console.log("PUBLIC INFLUENCER DIRECTORY VALIDATION PASSED — " + directory.profiles.length + " profiles; private contact fields prohibited; identity provenance checked.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run();
