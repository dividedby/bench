#!/usr/bin/env node
// Renders the committed `site/data.json` snapshot into a static, dependency-free
// `site/index.html` — a model × effort grid per skill, showing cost (mean USD/run)
// and quality (mean z-score across judges; higher is better, ~0 = panel average).
//
// Run by the Pages deploy workflow (.github/workflows/pages.yml) and locally. It only
// reads site/data.json — no results/, no secrets, no API calls. Pure helpers
// (escapeHtml, fmtCost, fmtZ, gridFor, renderHtml) are unit-tested offline.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const MODELS = ["opus", "sonnet", "haiku"];
const EFFORTS = ["low", "medium", "high"];

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

export function fmtCost(v) {
  return v == null || !Number.isFinite(v) ? "—" : `$${v.toFixed(3)}`;
}

export function fmtZ(v) {
  return v == null || !Number.isFinite(v) ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2);
}

// Build a model×effort HTML grid for one skill from its flat cell list. Pure.
export function gridFor(skill) {
  const byKey = {};
  for (const c of skill.cells) byKey[`${c.model}__${c.effort}`] = c;

  const head =
    "<tr><th>model \\ effort</th>" +
    EFFORTS.map((e) => `<th>${escapeHtml(e)}</th>`).join("") +
    "</tr>";

  const presentModels = MODELS.filter((m) => skill.cells.some((c) => c.model === m));
  const otherModels = [...new Set(skill.cells.map((c) => c.model))].filter(
    (m) => !MODELS.includes(m),
  );
  const rowModels = [...presentModels, ...otherModels];

  const body = rowModels
    .map((m) => {
      const presentEfforts = EFFORTS.filter((e) => skill.cells.some((c) => c.effort === e));
      const otherEfforts = [...new Set(skill.cells.map((c) => c.effort))].filter(
        (e) => !EFFORTS.includes(e),
      );
      const colEfforts = [...presentEfforts, ...otherEfforts];
      const cells = colEfforts
        .map((e) => {
          const c = byKey[`${m}__${e}`];
          if (!c) return '<td class="empty">—</td>';
          const noisy = c.noisy ? ' <span class="flag" title="noisy trial spread">~</span>' : "";
          return (
            "<td>" +
            `<div class="cost">${escapeHtml(fmtCost(c.costUsd))}</div>` +
            `<div class="z">z ${escapeHtml(fmtZ(c.meanZ))}${noisy}</div>` +
            "</td>"
          );
        })
        .join("");
      return `<tr><th>${escapeHtml(m)}</th>${cells}</tr>`;
    })
    .join("");

  return `<table>${head}${body}</table>`;
}

// Render the full HTML page from a data.json snapshot object. Pure.
export function renderHtml(data) {
  const sections = data.skills
    .map((s) => `<section><h2>${escapeHtml(s.skill)}</h2>${gridFor(s)}</section>`)
    .join("\n");
  const generated = data.generatedAt ? escapeHtml(data.generatedAt) : "unknown";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>bench — model × effort × cost/quality</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  section { margin: 2rem 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: .5rem .6rem; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; }
  td.empty { color: #aaa; text-align: center; }
  .cost { font-weight: 600; }
  .z { color: #555; font-size: .85em; }
  .flag { color: #c60; font-weight: 700; }
  p.meta { color: #666; font-size: .85em; }
  footer { margin-top: 3rem; color: #888; font-size: .8em; }
</style>
</head>
<body>
<h1>bench — model × effort × cost / quality</h1>
<p class="meta">Each cell: <strong>mean cost (USD/run)</strong> over <code>$cost</code> · <strong>z</strong> = mean judge z-score within that skill's blind panel (higher is better, 0 ≈ panel average). <span class="flag">~</span> = noisy trial spread. Quality z-scores are comparable only within a skill, not across skills.</p>
<p class="meta">Generated ${generated}. Derived snapshot — re-rendered on push; never re-benchmarked in CI.</p>
${sections}
<footer>Static render of <code>site/data.json</code>. Source: <a href="https://github.com/dividedby/bench">dividedby/bench</a>.</footer>
</body>
</html>
`;
}

function main() {
  const data = JSON.parse(readFileSync(join(ROOT, "site", "data.json"), "utf8"));
  const out = join(ROOT, "site", "index.html");
  writeFileSync(out, renderHtml(data));
  console.log(`Wrote ${out} (${data.skills.length} skills).`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
