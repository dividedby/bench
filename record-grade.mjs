#!/usr/bin/env node
// Append one panel grade to results/grading/<skill>/grades.jsonl.
// Usage: node record-grade.mjs --skill software-design --model gpt-5.4 --blind SO-01 --json '{"c1":90,...}'

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const a = {};
for (let i = 2; i < process.argv.length; i++)
  if (process.argv[i].startsWith("--")) a[process.argv[i].slice(2)] = process.argv[++i];

const parsed = JSON.parse(a.json);
const dir = join(ROOT, "results", "grading", a.skill);
mkdirSync(dir, { recursive: true });
const row = { blindId: a.blind, judge: a.model, scores: parsed, at: new Date().toISOString() };
appendFileSync(join(dir, "grades.jsonl"), JSON.stringify(row) + "\n");
console.log(`recorded ${a.blind} / ${a.model}: overall=${parsed.overall}`);
