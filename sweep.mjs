#!/usr/bin/env node
// Stage 2 orchestrator. Enumerates model × effort × task cells.
//
//   node sweep.mjs                 # dry run: print the plan + rough cost estimate, spend nothing
//   node sweep.mjs --go            # actually run every cell (spends money)
//   node sweep.mjs --aggregate     # build results/aggregated.csv from existing run records
//
// Flags: --models a,b  --efforts a,b  --tasks id,id  --trials N

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rederiveCostUsd } from "./core/index.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

const DEFAULT_MODELS = ["opus", "sonnet", "haiku"];
const DEFAULT_EFFORTS = ["low", "medium", "high"];

// Rough cost multipliers vs the observed sonnet/medium baseline ($0.30/run on the SD task).
// Honest heuristic only — real costs come from the run records.
const BASELINE_USD = 0.3;
const MODEL_MULT = { opus: 4, sonnet: 1, haiku: 0.3 };
const EFFORT_MULT = { low: 0.7, medium: 1, high: 1.5, xhigh: 2, max: 2.5 };

function parseArgs(argv) {
  const a = { go: false, aggregate: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--go") a.go = true;
    else if (k === "--aggregate") a.aggregate = true;
    else if (k.startsWith("--")) a[k.slice(2)] = argv[++i];
  }
  return a;
}

function listTasks(filter) {
  const dir = join(ROOT, "tasks");
  let files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const tasks = files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
  if (filter) {
    const want = new Set(filter.split(","));
    return tasks.filter((t) => want.has(t.id));
  }
  return tasks;
}

function buildCells(args) {
  const models = (args.models ?? DEFAULT_MODELS.join(",")).split(",");
  const efforts = (args.efforts ?? DEFAULT_EFFORTS.join(",")).split(",");
  const trials = Number(args.trials ?? 1);
  // --trial-start lets a later batch ADD trials (e.g. t2,t3) without re-running and
  // clobbering already-graded earlier trials. run.mjs rm's the work dir per run.
  const trialStart = Number(args["trial-start"] ?? 1);
  const tasks = listTasks(args.tasks);
  const cells = [];
  for (const task of tasks)
    for (const model of models)
      for (const effort of efforts)
        for (let trial = trialStart; trial <= trials; trial++)
          cells.push({ task, model, effort, trial });
  return cells;
}

function estimateUsd(cell) {
  return BASELINE_USD * (MODEL_MULT[cell.model] ?? 1) * (EFFORT_MULT[cell.effort] ?? 1);
}

function dryRun(cells) {
  console.log(`Plan: ${cells.length} runs\n`);
  let total = 0;
  for (const c of cells) {
    const est = estimateUsd(c);
    total += est;
    console.log(`  ${c.task.id.padEnd(26)} ${c.model.padEnd(7)} ${c.effort.padEnd(7)} t${c.trial}  ~$${est.toFixed(2)}`);
  }
  console.log(`\nRough total estimate: ~$${total.toFixed(2)} (heuristic; actuals come from run records)`);
  console.log(`\nThis was a DRY RUN. Re-run with --go to execute.`);
}

function execute(cells) {
  console.log(`Executing ${cells.length} runs sequentially...\n`);
  let failures = 0;
  cells.forEach((c, i) => {
    const taskPath = join("tasks", `${c.task.id}.json`);
    process.stdout.write(`(${i + 1}/${cells.length}) `);
    const p = spawnSync(
      "node",
      ["run.mjs", "--task", taskPath, "--model", c.model, "--effort", c.effort, "--trial", String(c.trial)],
      { cwd: ROOT, stdio: "inherit" },
    );
    if (p.status !== 0) failures++;
  });
  console.log(`\nDone. ${failures} failure(s). Run --aggregate to build the CSV.`);
}

function loadPricing() {
  try {
    return JSON.parse(readFileSync(join(ROOT, "pricing.json"), "utf8"));
  } catch {
    return null;
  }
}

function aggregate() {
  const pricing = loadPricing();
  const runsDir = join(ROOT, "results", "runs");
  let files = [];
  try {
    files = readdirSync(runsDir).filter((f) => f.endsWith(".json"));
  } catch {
    console.error("No results/runs/ yet.");
    process.exit(1);
  }
  const cols = [
    "runId", "skill", "source", "model", "effort", "trial", "exitCode",
    "isError", "costUsd", "costRederivedUsd", "costDeltaPct",
    "durationMs", "wallMs", "numTurns",
    "inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens",
  ];
  const rows = [cols.join(",")];
  let maxDelta = 0;
  for (const f of files.sort()) {
    const r = JSON.parse(readFileSync(join(runsDir, f), "utf8"));
    const m = r.metrics ?? {};
    const rederived = rederiveCostUsd(r.config?.model, m, r.modelUsage, pricing);
    let deltaPct = "";
    if (rederived != null && m.costUsd) {
      const d = ((rederived - m.costUsd) / m.costUsd) * 100;
      deltaPct = d.toFixed(1);
      maxDelta = Math.max(maxDelta, Math.abs(d));
    }
    rows.push([
      r.runId, r.task?.skill, r.task?.source, r.config?.model, r.config?.effort, r.config?.trial,
      r.exitCode, m.isError, m.costUsd, rederived != null ? rederived.toFixed(6) : "", deltaPct,
      m.durationMs, m.wallMs, m.numTurns,
      m.inputTokens, m.outputTokens, m.cacheReadTokens, m.cacheCreationTokens,
    ].map((v) => (v ?? "")).join(","));
  }
  mkdirSync(join(ROOT, "results"), { recursive: true });
  const out = join(ROOT, "results", "aggregated.csv");
  writeFileSync(out, rows.join("\n") + "\n");
  console.log(`Wrote ${out} (${files.length} runs).`);
  console.log(`Cost cross-check: max |delta| between harness and re-derived = ${maxDelta.toFixed(1)}%`);
  console.log(`(Small delta = consistent. Large delta on a few long sessions = expected 1h-cache`);
  console.log(` artifact: rederive assumes 5m cacheWrite, but long runs write some blocks at the 1h`);
  console.log(` rate and metrics don't break out the TTL split, so it's unrecoverable — harness`);
  console.log(` total_cost_usd is ground truth. Large delta across MANY runs ⇒ stale pricing.json or extraction bug.)`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.aggregate) return aggregate();
  const cells = buildCells(args);
  if (args.go) execute(cells);
  else dryRun(cells);
}

main();
