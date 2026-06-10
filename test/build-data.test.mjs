import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runIdToCell,
  parseCsv,
  costCellsBySkill,
  qualityCells,
  joinCells,
  buildData,
} from "../site/build-data.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV = readFileSync(join(HERE, "fixtures", "site-data", "aggregated.csv"), "utf8");

// Offline grading fixture for skill "demo": two cells, one full-coverage judge.
const DEMO_MAP = {
  "D-01": "demo-synthetic__opus__high__t1",
  "D-02": "demo-synthetic__opus__high__t2",
  "D-03": "demo-synthetic__haiku__low__t1",
};
const DEMO_GRADES = [
  { blindId: "D-01", judge: "j1", scores: { overall: 90 } },
  { blindId: "D-02", judge: "j1", scores: { overall: 88 } },
  { blindId: "D-03", judge: "j1", scores: { overall: 60 } },
  { blindId: "D-01", judge: "partial", scores: { overall: 99 } }, // dropped: not full coverage
];

test("runIdToCell pulls model + effort from the runId", () => {
  assert.deepEqual(runIdToCell("demo-synthetic__opus__high__t1"), {
    model: "opus",
    effort: "high",
  });
});

test("parseCsv maps header to row objects", () => {
  const rows = parseCsv(CSV);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].skill, "demo");
  assert.equal(rows[0].costUsd, "0.40");
});

test("costCellsBySkill means costUsd per (skill,model,effort) across trials", () => {
  const cost = costCellsBySkill(parseCsv(CSV));
  assert.ok(cost.demo && cost.costonly);
  const oh = cost.demo["opus__high"];
  assert.equal(oh.nTrials, 2);
  assert.ok(Math.abs(oh.costUsd - 0.5) < 1e-9, "mean of 0.40 + 0.60");
  assert.equal(cost.demo["haiku__low"].costUsd, 0.1);
});

test("qualityCells produces per-cell meanZ keyed by model__effort", () => {
  const q = qualityCells(DEMO_GRADES, DEMO_MAP);
  assert.ok("opus__high" in q && "haiku__low" in q);
  // opus__high has two trials (D-01, D-02) collapsed into one cell.
  assert.equal(q["opus__high"].nGradeTrials, 2);
  // haiku scored far lower → negative z; opus higher → positive z.
  assert.ok(q["opus__high"].meanZ > q["haiku__low"].meanZ);
});

test("joinCells unions cost + quality on the cell key, nulls the missing side", () => {
  const cost = costCellsBySkill(parseCsv(CSV)).demo;
  const quality = qualityCells(DEMO_GRADES, DEMO_MAP);
  const cells = joinCells(cost, quality);
  const oh = cells.find((c) => c.model === "opus" && c.effort === "high");
  assert.ok(oh.costUsd != null && oh.meanZ != null, "joined cell has both axes");
  // sonnet/medium exists only in cost (costonly skill), not here; demo has no quality-only cell.
  assert.ok(cells.every((c) => c.costUsd != null), "all demo cells have cost");
});

test("joinCells keeps a quality-only cell with null cost", () => {
  const quality = qualityCells(DEMO_GRADES, DEMO_MAP);
  const cells = joinCells(undefined, quality);
  assert.ok(cells.every((c) => c.costUsd == null && c.meanZ != null));
});

test("buildData assembles snapshot: skills sorted, cost-only skill rendered", () => {
  const data = buildData(CSV, { demo: { grades: DEMO_GRADES, map: DEMO_MAP } }, "2026-01-01T00:00:00Z");
  assert.equal(data.generatedAt, "2026-01-01T00:00:00Z");
  assert.deepEqual(data.skills.map((s) => s.skill), ["costonly", "demo"]);
  const costonly = data.skills.find((s) => s.skill === "costonly");
  assert.ok(costonly.cells.every((c) => c.meanZ == null), "costonly skill has no quality");
  const demo = data.skills.find((s) => s.skill === "demo");
  assert.ok(demo.cells.some((c) => c.meanZ != null), "demo skill carries quality");
});
