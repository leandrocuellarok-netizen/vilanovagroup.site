import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const htmlPath = resolve(root, "index.html");
assert.ok(existsSync(htmlPath), "index.html must exist");
const html = readFileSync(htmlPath, "utf8");

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
assert.ok(html.includes('href="/docs/EVIDENCE-LEDGER.md"'), "The public site must link to its evidence protocol");

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

console.log("VILANOVA SITE VALIDATION PASSED — " + expectedSections.length + " sections, " + assetPaths.length + " local assets, unique IDs, internal links, footer/contact policy, AI module honesty, reduced motion, keyboard focus and inline JavaScript syntax.");
