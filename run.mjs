#!/usr/bin/env node
// Stage 1 runner: execute one skill, one fixture, one (model, effort) cell, headlessly.
// Thin wrapper over core/executeRun — parses argv, copies the fixture, runs the cell,
// then persists results/ records and prints the summary line. Run mechanic lives in core.
//
// Usage:
//   node run.mjs --task tasks/software-design-synthetic.json --model sonnet --effort medium [--trial 1]

import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { executeRun } from "./core/index.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith("--")) args[k.slice(2)] = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const { task: taskPath, model, effort } = args;
  const trial = args.trial ?? "1";
  if (!taskPath || !model || !effort) {
    console.error("Usage: node run.mjs --task <file> --model <m> --effort <e> [--trial N]");
    process.exit(2);
  }

  const task = JSON.parse(readFileSync(resolvePath(ROOT, taskPath), "utf8"));
  const runId = `${task.id}__${model}__${effort}__t${trial}`;
  const workDir = join(ROOT, "results", "work", runId);
  const fixtureDir = join(ROOT, "fixtures", task.fixture);

  // Fresh isolated copy of the fixture.
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(dirname(workDir), { recursive: true });
  cpSync(fixtureDir, workDir, { recursive: true });

  const out = await executeRun({ task, model, effort, trial, workDir });
  const m = out.metrics;
  const { result, ...rest } = out;

  const record = {
    ...rest,
    workDir: workDir.replace(ROOT + "/", ""),
  };

  const runsDir = join(ROOT, "results", "runs");
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, `${runId}.json`), JSON.stringify(record, null, 2));
  // Full raw result for introspection (modelUsage, server tool use, etc.).
  if (result) {
    const rawDir = join(ROOT, "results", "raw");
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(join(rawDir, `${runId}.json`), JSON.stringify(result, null, 2));
  }

  console.log(
    `[${runId}] exit=${result.exitCode} cost=$${m.costUsd ?? "?"} ` +
      `turns=${m.numTurns ?? "?"} dur=${m.durationMs ?? "?"}ms wall=${m.wallMs}ms ` +
      `out=${m.outputTokens ?? "?"}tok` + (m.parseFailed ? "  [JSON PARSE FAILED]" : ""),
  );
  if (m.parseFailed) {
    console.error("stderr:", out.raw?.stderr?.slice(0, 1000));
    process.exit(1);
  }
}

main();
