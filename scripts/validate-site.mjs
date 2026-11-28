import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const htmlPath = resolve(root, "index.html");
assert.ok(existsSync(htmlPath), "index.html must exist");
const html = readFileSync(htmlPath, "utf8");
const auditScript = readFileSync(resolve(root, "scripts/audit-influencer-freshness.mjs"), "utf8");
const auditTests = readFileSync(resolve(root, "scripts/test-influencer-freshness.mjs"), "utf8");
const reviewDocs = readFileSync(resolve(root, "docs/PROFILE-REVIEW-CADENCE.md"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/site-validation.yml"), "utf8");
const commercialBuilder = readFileSync(resolve(root, "scripts/build-commercial-intelligence.mjs"), "utf8");
const commercialTests = readFileSync(resolve(root, "scripts/test-commercial-intelligence.mjs"), "utf8");
const commercialDocs = readFileSync(resolve(root, "docs/COMMERCIAL-INTELLIGENCE-REPORT.md"), "utf8");
const siteContentHasReviewExport = auditScript.includes("exportReviewQueueCsv") &&
  auditTests.includes("Formula-like") && reviewDocs.includes("--csv > influencer-review-queue.csv") &&
  workflow.includes("actions/upload-artifact@v4");

const expectedSections = ["ecosystem", "ventures", "intelligence", "ai-solutions", "network"];
const expectedNav = ["THE ECOSYSTEM", "VENTURES", "VILANOVA AI MEDIA", "VILANOVA AI SOLUTIONS", "NETWORK"];

assert.match(html, /<html\s+lang="en"/i, "The document must be English");
const navMatch = html.match(/<nav\b[^>]*aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/i);
assert.ok(navMatch, "Primary navigation must exist");
const navLinks = [...navMatch[1].matchAll(/<a\b[^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
  .map(([, href, label]) => ({ href, label: label.replace(/<[^>]*>/g, "").trim() }));
assert.deepEqual(navLinks.map(x => x.label), expectedNav, "Primary navigation labels and order must match the approved architecture");
assert.deepEqual(navLinks.map(x => x.href), expectedSections, "Primary navigation destinations must match the five approved sections");

const sectionIds = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/gi)].map(([, id]) => id);
assert.deepEqual(sectionIds, expectedSections, "The page must contain exactly the five approved primary sections");
assert.ok(!/id="contact"/i.test(html), "A CONTACT section must not return");
assert.ok(!/href="#contact"/i.test(html), "A CONTACT navigation or content link must not return");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicateIds)], [], "HTML IDs must be unique");
const idSet = new Set(ids);
for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) {
  assert.ok(idSet.has(target), "Internal link target #" + target + " must exist");
}

const mailto = [...html.matchAll(/mailto:([^"'?]+)/g)].map(([, address]) => address);
assert.deepEqual(mailto, ["strategy@vilanovagroup.site"], "The only contact channel must be the approved strategy email");
assert.match(html, /FOUNDER\s*\/\s*LEANDRO A\. CUELLAR/i, "Founder attribution must be present");
assert.match(html, /GENERAL COORDINATION\s*\/\s*ERICA ACOSTA/i, "General Coordinator attribution must be present");
assert.ok(html.includes("“Behold, I make all things new.”"), "The exact footer quotation must be present");
assert.ok(html.includes("REVELATION 21:5 — KJV"), "The footer citation must identify Revelation 21:5 KJV");

assert.ok(html.includes("INFLUENCE RADAR AI"), "Influence Radar AI module must exist");
assert.ok(html.includes("VILANOVA AI FABRIC"), "Vilanova AI Fabric module must exist");
assert.ok(html.includes("LIVE FEED NOT CONNECTED"), "Influence Radar must not imply an unconnected live feed");
assert.ok(html.includes("DOWNSTREAM EXPANSION REQUIREMENT"), "AI Fabric must distinguish a local blueprint from model-generated expansion");
assert.ok(html.includes("NO MODEL CONNECTED"), "AI Fabric must disclose that no model is connected");
assert.ok(!html.includes("while(count<target"), "AI Fabric must not pad word counts by repeating generic sections");
assert.ok(html.includes("prefers-reduced-motion: reduce"), "Reduced-motion support must remain in place");
assert.ok(html.includes("focus-visible"), "Visible keyboard focus styles must remain in place");

const evidenceSchemaPath = resolve(root, "schemas/evidence-event.schema.json");
const evidenceLedgerPath = resolve(root, "data/evidence-events.json");
assert.ok(existsSync(evidenceSchemaPath), "The evidence-event JSON Schema must exist");
assert.ok(existsSync(evidenceLedgerPath), "The evidence ledger must exist");
const evidenceSchema = JSON.parse(readFileSync(evidenceSchemaPath, "utf8"));
const evidenceLedger = JSON.parse(readFileSync(evidenceLedgerPath, "utf8"));
assert.equal(evidenceSchema.$schema, "https://json-schema.org/draft/2020-12/schema", "Evidence schema must declare JSON Schema 2020-12");
assert.equal(evidenceLedger.schema_version, "1.0.0", "Evidence ledger version must be explicit");
assert.ok(Array.isArray(evidenceLedger.events), "Evidence ledger events must be an array");
assert.ok(existsSync(resolve(root, "scripts/validate-evidence-ledger.mjs")), "Evidence validator must exist");
assert.ok(existsSync(resolve(root, "scripts/test-evidence-ledger.mjs")), "Evidence regression tests must exist");
assert.ok(html.includes('href="https://github.com/leandrocuellarok-netizen/vilanovagroup.site/blob/main/docs/EVIDENCE-LEDGER.md"'), "The public site must link to its evidence protocol");
assert.ok(existsSync(resolve(root, "schemas/influencer-profile.schema.json")), "The public influencer profile schema must exist");
assert.ok(existsSync(resolve(root, "data/influencer-profiles.json")), "The public influencer directory must exist");
assert.ok(existsSync(resolve(root, "scripts/validate-influencer-profiles.mjs")), "The public influencer validator must exist");
assert.ok(existsSync(resolve(root, "scripts/test-influencer-profiles.mjs")), "The public influencer regression tests must exist");
assert.ok(existsSync(resolve(root, "scripts/audit-influencer-freshness.mjs")), "The public influencer freshness audit must exist");
assert.ok(existsSync(resolve(root, "scripts/test-influencer-freshness.mjs")), "The public influencer freshness audit tests must exist");
assert.ok(existsSync(resolve(root, "docs/PROFILE-REVIEW-CADENCE.md")), "The profile review cadence must be documented");
assert.ok(siteContentHasReviewExport, "Spreadsheet-safe review queue export and CI artifact must remain wired and documented");
assert.ok(html.includes("PROFILE-REVIEW-CADENCE.md"), "The public site must link to the profile review cadence");
assert.ok(existsSync(resolve(root, "scripts/build-commercial-intelligence.mjs")), "Commercial intelligence report builder must exist");
assert.ok(existsSync(resolve(root, "scripts/test-commercial-intelligence.mjs")), "Commercial intelligence regression tests must exist");
assert.ok(existsSync(resolve(root, "docs/COMMERCIAL-INTELLIGENCE-REPORT.md")), "Commercial intelligence report standard must exist");
assert.ok(html.includes('href="https://github.com/leandrocuellarok-netizen/vilanovagroup.site/blob/main/docs/COMMERCIAL-INTELLIGENCE-REPORT.md"'), "The public site must link to the commercial intelligence standard");
assert.ok(workflow.includes("node scripts/build-commercial-intelligence.mjs --json") && workflow.includes("commercial-intelligence-report"), "Commercial intelligence JSON/CSV artifact must be wired into CI");
assert.ok(commercialBuilder.includes("commercialEventKey") && commercialBuilder.includes("duplicate_source_event") &&
  commercialTests.includes("tracking-parameter duplicate") && commercialDocs.includes("Source-level deduplication"),
  "Commercial intelligence must deduplicate repeated source events and document its limits.");

const influencerSchema = JSON.parse(readFileSync(resolve(root, "schemas/influencer-profile.schema.json"), "utf8"));
const influencerDirectory = JSON.parse(readFileSync(resolve(root, "data/influencer-profiles.json"), "utf8"));
assert.equal(influencerSchema.$schema, "https://json-schema.org/draft/2020-12/schema", "Influencer profile schema must declare JSON Schema 2020-12");
assert.equal(influencerDirectory.schema_version, "1.0.0", "Influencer directory version must be explicit");
assert.ok(Array.isArray(influencerDirectory.profiles), "Influencer directory profiles must be an array");
assert.ok(html.includes('href="https://github.com/leandrocuellarok-netizen/vilanovagroup.site/blob/main/docs/ARGENTINA-INFLUENCER-DIRECTORY.md"'), "The public site must link to the Argentina influencer directory protocol");

const assetPaths = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(([, path]) => path))];
for (const asset of assetPaths) {
  assert.ok(existsSync(resolve(root, "." + asset)), "Referenced asset must exist: " + asset);
}

const tempDir = mkdtempSync(join(tmpdir(), "vilanova-inline-js-"));
try {
  let checkedScripts = 0;
  for (const [, attrs, source] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/type=["']application\/ld\+json["']/i.test(attrs)) continue;
    const scriptPath = join(tempDir, "inline-" + checkedScripts + ".js");
    writeFileSync(scriptPath, source, "utf8");
    const result = spawnSync(process.execPath, ["--check", scriptPath], { encoding: "utf8" });
    assert.equal(result.status, 0, "Inline JavaScript " + (checkedScripts + 1) + " must parse: " + (result.stderr || result.stdout));
    checkedScripts++;
  }
  assert.ok(checkedScripts > 0, "At least one executable inline script must be checked");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("VILANOVA SITE VALIDATION PASSED — " + expectedSections.length + " sections, " + assetPaths.length + " local assets, unique IDs, internal links, footer/contact policy, AI module honesty, commercial intelligence pipeline, reduced motion, keyboard focus and inline JavaScript syntax.");
