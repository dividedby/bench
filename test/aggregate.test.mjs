import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, groupByCell } from "../core/index.mjs";

// Ported from the original aggregate-grades.mjs selftest() into real assertions.

test("normalize keeps full-coverage judges, drops partial, ranks by raw, centers z", () => {
  const ids = ["A", "B", "C", "D", "E"];
  const gptScale = { A: 96, B: 92, C: 88, D: 86, E: 84 };   // wide spread
  const flashScale = { A: 74, B: 73, C: 71, D: 70, E: 68 }; // narrow spread
  const g = [];
  for (const k of ids) {
    g.push({ blindId: k, judge: "gpt", scores: { overall: gptScale[k] } });
    g.push({ blindId: k, judge: "flash", scores: { overall: flashScale[k] } });
  }
  g.push({ blindId: "A", judge: "saturated", scores: { overall: 100 } }); // partial -> dropped

  const r = normalize(g);
  assert.equal(r.judges.length, 2, "keep 2 full-coverage judges");
  assert.equal(r.dropped.length, 1);
  assert.equal(r.dropped[0].judge, "saturated", "drop partial judge");
  assert.equal(r.cells.map((c) => c.blindId).join(""), "ABCDE", "rank order A>B>C>D>E");
  assert.ok(r.cells[0].normZ > 0 && r.cells[4].normZ < 0, "z centered around mean");
  assert.ok(r.cells.every((c) => !c.disagree), "no disagreement when orderings match");
});

test("normalize flags DISAGREE when a judge reverses the ordering", () => {
  const ids = ["A", "B", "C", "D", "E"];
  const gptScale = { A: 96, B: 92, C: 88, D: 86, E: 84 };
  const flashScale = { A: 74, B: 73, C: 71, D: 70, E: 68 };
  const rev = { A: "E", B: "D", C: "C", D: "B", E: "A" };
  const g2 = [];
  for (const k of ids) {
    g2.push({ blindId: k, judge: "gpt", scores: { overall: gptScale[k] } });
    g2.push({ blindId: k, judge: "flash", scores: { overall: flashScale[rev[k]] } });
  }
  const r2 = normalize(g2);
  assert.ok(r2.cells.find((c) => c.blindId === "A").disagree, "A flags DISAGREE on reversed orders");
});

test("groupByCell collapses trials, flags noisy cells, ranks tight high cell first", () => {
  const resolve = (b) => ({
    X1: { model: "m", effort: "lo" }, X2: { model: "m", effort: "lo" },
    Y1: { model: "m", effort: "hi" }, Y2: { model: "m", effort: "hi" },
  }[b]);
  const blindCells = [
    { blindId: "X1", normZ: 1.0, rawMean: 95 }, { blindId: "X2", normZ: 1.1, rawMean: 96 }, // tight
    { blindId: "Y1", normZ: 1.0, rawMean: 95 }, { blindId: "Y2", normZ: -1.0, rawMean: 70 }, // wide
  ];
  const grouped = groupByCell(blindCells, resolve);
  assert.equal(grouped.length, 2, "two cells");
  const lo = grouped.find((r) => r.effort === "lo");
  const hi = grouped.find((r) => r.effort === "hi");
  assert.ok(!lo.noisy, "tight cell not noisy");
  assert.ok(hi.noisy, "wobbly cell flagged noisy");
  assert.ok(lo.meanZ > hi.meanZ, "tight high cell ranks above wobbly cell");
});
