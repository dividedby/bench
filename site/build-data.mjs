#!/usr/bin/env node
// LOCAL build tool — NOT run in CI. Requires the local `results/` tree (gitignored).
//
// Derives the committed `site/data.json` snapshot that the Pages deploy renders.
// Joins the two benchmark pipelines on the `model__effort` cell key, faceted by skill:
//   cost    — results/aggregated.csv (built by `node sweep.mjs --aggregate`)
//   quality — results/grading/<skill>/{grades.jsonl,map.json} → core normalize/groupByCell
//
// The pure transforms (parseCsv, costCellsBySkill, qualityCellsBySkill, joinCells,
// buildData) take already-read strings/objects so they are unit-testable offline against
// a small fixture (test/build-data.test.mjs). Only `main()` touches the filesystem.
//
// Usage (local only): `node site/build-data.mjs` → writes site/data.json.
// It never mutates results/.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalize, groupByCell } from "../core/index.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const cellKey = (model, effort) => `${model}__${effort}`;

// runId shape: `<skill>-<source>__<model>__<effort>__t<trial>` (see sweep.mjs / map.json).
export function runIdToCell(runId) {
  const parts = runId.split("__");
  return { model: parts[1], effort: parts[2] };
}

// Parse aggregated.csv into row objects keyed by header. Pure: takes the CSV text.
export function parseCsv(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row = {};
    header.forEach((h, i) => (row[h] = vals[i]));
    return row;
  });
}

// Cost axis: mean costUsd per (skill, model, effort) cell across trials. Pure.
// Returns { [skill]: { [model__effort]: { model, effort, costUsd, nTrials } } }.
export function costCellsBySkill(csvRows) {
  const bySkill = {};
  for (const r of csvRows) {
    const cost = Number(r.costUsd);
    if (!r.skill || !r.model || !r.effort || !Number.isFinite(cost)) continue;
    const skill = (bySkill[r.skill] ??= {});
    const key = cellKey(r.model, r.effort);
    const cell = (skill[key] ??= { model: r.model, effort: r.effort, costs: [] });
    cell.costs.push(cost);
  }
  for (const skill of Object.values(bySkill)) {
    for (const c of Object.values(skill)) {
      c.costUsd = c.costs.reduce((s, x) => s + x, 0) / c.costs.length;
      c.nTrials = c.costs.length;
      delete c.costs;
    }
  }
  return bySkill;
}

// Quality axis for one skill: grades + map → core normalize/groupByCell → per-cell meanZ.
// Pure: takes the parsed grades array and the blindId→runId map. Returns
// { [model__effort]: { model, effort, meanZ, nGradeTrials, noisy } }.
export function qualityCells(grades, map) {
  const { cells } = normalize(grades);
  const rows = groupByCell(cells, (blindId) => runIdToCell(map[blindId]));
  const out = {};
  for (const r of rows) {
    out[cellKey(r.model, r.effort)] = {
      model: r.model,
      effort: r.effort,
      meanZ: r.meanZ,
      nGradeTrials: r.nTrials,
      noisy: r.noisy,
    };
  }
  return out;
}

// Join cost + quality cells for one skill on the model__effort key. Pure.
export function joinCells(costBySkillCell, qualityByCell) {
  const keys = new Set([
    ...Object.keys(costBySkillCell ?? {}),
    ...Object.keys(qualityByCell ?? {}),
  ]);
  const cells = [];
  for (const key of keys) {
    const cost = costBySkillCell?.[key];
    const quality = qualityByCell?.[key];
    const { model, effort } = cost ?? quality;
    cells.push({
      model,
      effort,
      costUsd: cost ? cost.costUsd : null,
      nTrials: cost ? cost.nTrials : null,
      meanZ: quality ? quality.meanZ : null,
      nGradeTrials: quality ? quality.nGradeTrials : null,
      noisy: quality ? quality.noisy : null,
    });
  }
  cells.sort((a, b) =>
    a.model === b.model ? a.effort.localeCompare(b.effort) : a.model.localeCompare(b.model),
  );
  return cells;
}

// Assemble the full snapshot. Pure: takes CSV text + per-skill {grades,map}.
// quBySkill: { [skill]: { grades: Grade[], map: Record<blindId,runId> } }.
export function buildData(csvText, quBySkill, generatedAt) {
  const cost = costCellsBySkill(parseCsv(csvText));
  const skillNames = [...new Set([...Object.keys(cost), ...Object.keys(quBySkill)])].sort();
  const skills = skillNames.map((skill) => {
    const quality = quBySkill[skill]
      ? qualityCells(quBySkill[skill].grades, quBySkill[skill].map)
      : {};
    return { skill, cells: joinCells(cost[skill], quality) };
  });
  return { generatedAt, skills };
}

// ---- thin fs runner (local only) ----

function loadQualityBySkill() {
  const gradingDir = join(ROOT, "results", "grading");
  const out = {};
  let skills = [];
  try {
    skills = readdirSync(gradingDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return out;
  }
  for (const skill of skills) {
    const dir = join(gradingDir, skill);
    try {
      const map = JSON.parse(readFileSync(join(dir, "map.json"), "utf8"));
      const grades = readFileSync(join(dir, "grades.jsonl"), "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      out[skill] = { grades, map };
    } catch {
      // skill without complete grading data is cost-only
    }
  }
  return out;
}

function main() {
  const csvText = readFileSync(join(ROOT, "results", "aggregated.csv"), "utf8");
  const quBySkill = loadQualityBySkill();
  const data = buildData(csvText, quBySkill, new Date().toISOString());
  const out = join(ROOT, "site", "data.json");
  writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
  const cellCount = data.skills.reduce((s, sk) => s + sk.cells.length, 0);
  console.log(`Wrote ${out} (${data.skills.length} skills, ${cellCount} cells).`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
