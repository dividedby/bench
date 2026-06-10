#!/usr/bin/env node
// Join blind grades back to runs and summarize per submission.
// Multi-judge aggregation: judges run on different scales (e.g. GPT-5.4 84-96,
// Gemini 3.5 Flash 68-74), so a raw mean would let the wider-spread judge
// dominate. We per-judge z-score `overall` across that judge's cells, then
// average the z-scores. Only judges with FULL coverage (graded every cell)
// enter the normalized aggregate — you can't normalize a partial judge, and
// this auto-excludes leftover/rejected partial passes without deleting data.
//   node aggregate-grades.mjs --skill software-design
//
// Thin wrapper: normalize / groupByCell live in core/aggregate.mjs (their canonical
// home, with the ported selftest in test/aggregate.test.mjs — run `node --test`).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalize, groupByCell } from "./core/index.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

const a = {};
for (let i = 2; i < process.argv.length; i++)
  if (process.argv[i].startsWith("--")) a[process.argv[i].slice(2)] = process.argv[++i] ?? true;

const dir = join(ROOT, "results", "grading", a.skill);
const map = JSON.parse(readFileSync(join(dir, "map.json"), "utf8")); // blindId -> runId
const lines = readFileSync(join(dir, "grades.jsonl"), "utf8").trim().split("\n").filter(Boolean);
const grades = lines.map((l) => JSON.parse(l));

const cfg = (runId) => {
  const parts = runId.split("__");
  return { model: parts[1], effort: parts[2] };
};

const { cells, judges, dropped } = normalize(grades);

console.log(`\n${a.skill} — ${grades.length} grades, ${judges.length} full-coverage judge(s): ${judges.join(", ")}`);
if (dropped.length)
  console.log(`dropped (partial coverage): ${dropped.map((d) => `${d.judge} ${d.graded}/${d.of}`).join(", ")}`);

if (a["by-cell"]) {
  // Stage 4: collapse trials into (model,effort) cells, show trial spread (run variance).
  const rows = groupByCell(cells, (b) => cfg(map[b]));
  console.log("\nrank  model   effort   trials  per-trial rawMeans   meanZ   trialStd  flag");
  rows.forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(2)}.   ${r.model.padEnd(7)} ${r.effort.padEnd(7)} ${String(r.nTrials).padStart(5)}   ` +
        `${r.rawMeans.map((x) => x.toFixed(0)).join("/").padEnd(18)}  ${(r.meanZ >= 0 ? "+" : "") + r.meanZ.toFixed(2)}   ${r.trialStd.toFixed(2).padStart(5)}    ${r.noisy ? "NOISY" : ""}`,
    );
  });
  console.log("");
} else {
  console.log("\nrank  model   effort   judges  raw overalls   rawMean   normZ   flag");
  cells.forEach((c, i) => {
    const { model, effort } = cfg(map[c.blindId]);
    console.log(
      `${String(i + 1).padStart(2)}.   ${model.padEnd(7)} ${effort.padEnd(7)} ${String(c.judges).padStart(5)}   ` +
        `${c.raws.join("/").padEnd(12)}  ${c.rawMean.toFixed(1).padStart(5)}   ${(c.normZ >= 0 ? "+" : "") + c.normZ.toFixed(2)}   ${c.disagree ? "DISAGREE" : ""}`,
    );
  });
  console.log("");
}
