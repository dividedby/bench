#!/usr/bin/env node
// Stage 3 prep: turn a skill's run artifacts into BLIND grading prompts for the
// Perplexity panel. Each artifact gets a randomized blind ID; the id->runId map is
// written separately and never shown to a judge. Each prompt is self-contained:
// shared context + the 5 rubric criteria + the one artifact + a strict JSON instruction.
//
//   node build-grading-prompts.mjs --task tasks/software-design-synthetic.json
//
// Writes:
//   results/grading/<skill>/map.json            blindId -> runId (PRIVATE)
//   results/grading/<skill>/prompts/<blindId>.txt
//   results/grading/<skill>/schema.json         the JSON shape judges must return

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));

// Resolve a possibly-globbed artifact path (only trailing `*.ext` in the last segment
// is supported) to actual files under a run's working copy.
function resolveArtifacts(workDir, pattern) {
  if (!pattern.includes("*")) return [pattern];
  const dir = pattern.slice(0, pattern.lastIndexOf("/"));
  const ext = pattern.slice(pattern.lastIndexOf("."));
  return readdirSync(join(workDir, dir))
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => `${dir}/${f}`);
}

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i];
  return a;
}

// Deterministic-ish shuffle so reruns are stable within a session but order isn't model-aligned.
function shuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function main() {
  const args = parseArgs(process.argv);
  const task = JSON.parse(readFileSync(join(ROOT, args.task), "utf8"));
  const fixtureDir = join(ROOT, "fixtures", task.fixture);
  const context = readFileSync(join(fixtureDir, "CONTEXT.md"), "utf8");
  // The spec the work responds to: a fixture PRD when the skill consumes one
  // (software-design), else the task brief (frontend-design, to-prd — the latter
  // PRODUCES the PRD, so it can't be a fixture input).
  const prdPath = join(fixtureDir, ".scratch", "prd.md");
  const hasPrd = existsSync(prdPath);
  const specLabel = hasPrd ? "The PRD the work product responds to" : "The brief the work product responds to";
  const spec = hasPrd
    ? readFileSync(prdPath, "utf8")
    : task.prompt.replace(/^\/\S+\s*\n+/, ""); // drop the leading "/skill" invocation line

  const artifactPatterns = task.gradeArtifacts ?? task.expectedArtifacts;
  const runsDir = join(ROOT, "results", "runs");
  const runIds = readdirSync(runsDir)
    .filter((f) => f.startsWith(task.id) && f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  const outDir = join(ROOT, "results", "grading", task.skill);
  const promptsDir = join(outDir, "prompts");
  mkdirSync(promptsDir, { recursive: true });

  // ADDITIVE: preserve any existing blind map (and its already-recorded grades).
  // Only runs not yet mapped get fresh blind IDs, numbered past the existing ones.
  // This lets later trials (t2,t3) join without remapping/clobbering graded trials.
  const mapPath = join(outDir, "map.json");
  const map = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, "utf8")) : {};
  const alreadyMapped = new Set(Object.values(map));
  const newRunIds = runIds.filter((r) => !alreadyMapped.has(r));
  const startIdx = Object.keys(map).length;
  const shuffled = shuffle(newRunIds, runIds.length);

  const criteria = task.rubric.map((r, i) => `${i + 1}. ${r}`).join("\n");
  const keys = task.rubric.map((_, i) => `"c${i + 1}":<0-100>`).join(",");

  shuffled.forEach((runId, i) => {
    const idx = startIdx + i;
    const blindId = `${task.skill.toUpperCase().slice(0, 2)}-${String(idx + 1).padStart(2, "0")}`;
    map[blindId] = runId;
    const workDir = join(ROOT, "results", "work", runId);
    // Tolerate runs that under-delivered (e.g. a flaky model that didn't write a
    // primary artifact despite the UNATTENDED "write all artifacts" instruction):
    // grade whatever exists rather than crashing the whole build. A missing primary
    // deliverable will (correctly) tank that submission's grade — real reliability signal.
    const files = artifactPatterns
      .flatMap((p) => resolveArtifacts(workDir, p))
      .filter((rel) => {
        const ok = existsSync(join(workDir, rel));
        if (!ok) console.warn(`  [warn] ${runId}: missing artifact ${rel} — omitted from prompt`);
        return ok;
      });
    const artifact = files
      .map((rel) => `### FILE: ${rel}\n${readFileSync(join(workDir, rel), "utf8").trim()}`)
      .join("\n\n");
    const prompt = [
      `You are an expert reviewer grading one work product against a fixed rubric. Be a discerning, calibrated grader: use the full 0-100 range, reserve 90+ for genuinely excellent work, and do not inflate.`,
      ``,
      `## Shared context (the same for every submission)`,
      `### Domain (CONTEXT.md)`,
      context.trim(),
      ``,
      `### ${specLabel}`,
      spec.trim(),
      ``,
      `## Rubric — score each criterion 0-100`,
      criteria,
      ``,
      `## Submission ${blindId}`,
      "```",
      artifact.trim(),
      "```",
      ``,
      `Reply with ONLY this JSON object and nothing else (no prose, no code fence):`,
      `{${keys},"overall":<0-100>,"note":"<one short sentence>"}`,
    ].join("\n");
    writeFileSync(join(promptsDir, `${blindId}.txt`), prompt);
  });

  writeFileSync(join(outDir, "map.json"), JSON.stringify(map, null, 2));
  writeFileSync(
    join(outDir, "schema.json"),
    JSON.stringify({ criteria: task.rubric, jsonKeys: [...task.rubric.map((_, i) => `c${i + 1}`), "overall", "note"] }, null, 2),
  );
  console.log(`Wrote ${shuffled.length} blind prompts to ${promptsDir.replace(ROOT + "/", "")}`);
  console.log(`Blind map (PRIVATE): ${join(outDir, "map.json").replace(ROOT + "/", "")}`);
}

main();
