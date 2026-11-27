import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("index.html", "utf8");
const moduleStart = html.indexOf("const fabricModules={");
const handlerStart = html.indexOf("fabricGenerate?.addEventListener", moduleStart);
assert.ok(moduleStart >= 0 && handlerStart > moduleStart, "AI Fabric prompt builder must be present in index.html");

const builderSource = html.slice(moduleStart, handlerStart) + "\nglobalThis.__buildPrompt = fabricBuildPrompt;";
const sandbox = {};
vm.runInNewContext(builderSource, sandbox, { timeout: 1000 });
assert.equal(typeof sandbox.__buildPrompt, "function", "AI Fabric builder must be executable");

const request = 'Quiero lanzar una empresa de IA para hoteles boutique en Argentina y preparar un plan comercial de doce meses.';
const cases = [
  ["business", 8, "BUSINESS THESIS AND VALUE CREATION"],
  ["image", 8, "VISUAL INTENT AND SEMANTIC HIERARCHY"],
  ["writing", 7, "AUDIENCE, PURPOSE AND COMMUNICATION STRATEGY"],
  ["report", 8, "RESEARCH QUESTION AND EXECUTIVE PURPOSE"],
  ["spreadsheet", 7, "MODEL PURPOSE, USERS AND DECISION CONTEXT"],
  ["automation", 8, "PROCESS DISCOVERY AND CURRENT-STATE MAP"],
  ["research", 7, "PROBLEM DEFINITION AND DECISION QUESTION"]
];

for (const [type, expectedWorkstreams, expectedHeading] of cases) {
  for (const target of [3000, 4500, 6000]) {
    const prompt = sandbox.__buildPrompt(request, type, target);
    assert.ok(prompt.includes(request), type + " must preserve the original Spanish request");
    assert.ok(prompt.includes("OUTPUT TYPE: " + type.toUpperCase()), type + " must retain the selected output category");
    assert.ok(prompt.includes("TARGET: " + target + " words minimum"), type + " must retain the selected expansion target");
    assert.ok(prompt.includes(expectedHeading), type + " must include its specialist framework");
    assert.ok(prompt.includes("DOWNSTREAM EXPANSION REQUIREMENT"), "The local blueprint must distinguish itself from the final model-generated prompt");
    assert.match(prompt, /never repeat paragraphs or pad length/i, "The production handoff must prohibit artificial padding");

    const workstreamParagraphs = prompt.split(/\n\s*\n/)
      .filter(block => /^\d{2} — \d{2} \/ /.test(block))
      .map(block => block.split("\n").slice(1).join("\n").trim());
    assert.equal(workstreamParagraphs.length, expectedWorkstreams, type + " must produce the expected number of specialist workstreams");
    assert.equal(new Set(workstreamParagraphs).size, workstreamParagraphs.length, type + " must not repeat generic workstream instructions");
    assert.ok(prompt.trim().split(/\s+/).length < target, "The local prototype must not falsely claim it already generated the final target length");
  }
}

const fallback = sandbox.__buildPrompt(request, "unrecognized-category", 3000);
assert.ok(fallback.includes("PROBLEM DEFINITION AND DECISION QUESTION"), "Unknown categories must fall back to the general research framework");
assert.ok(html.includes("NO MODEL CONNECTED"), "The UI must disclose that a real model is not connected");

console.log("VILANOVA AI FABRIC TESTS PASSED — 7 categories × 3 depth targets, Spanish intent preservation, specialist workstreams, no repeated workstream copy, honest prototype boundary and unknown-category fallback.");
