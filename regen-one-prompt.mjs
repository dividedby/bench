// One-off: regenerate a SINGLE already-mapped blind prompt from current artifacts.
// Needed when a cell is re-run (fresh trial) but keeps its existing blind ID — the
// additive build-grading-prompts.mjs skips already-mapped runs, so its prompt would
// otherwise still reflect the overwritten artifacts. Mirrors that script's template exactly.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const [taskRel, blindId] = process.argv.slice(2);
if (!taskRel || !blindId) { console.error("usage: node regen-one-prompt.mjs <task.json> <blindId>"); process.exit(1); }

function resolveArtifacts(workDir, pattern) {
  if (!pattern.includes("*")) return [pattern];
  const dir = pattern.slice(0, pattern.lastIndexOf("/"));
  const ext = pattern.slice(pattern.lastIndexOf("."));
  return readdirSync(join(workDir, dir)).filter((f) => f.endsWith(ext)).sort().map((f) => `${dir}/${f}`);
}

const task = JSON.parse(readFileSync(join(ROOT, taskRel), "utf8"));
const fixtureDir = join(ROOT, "fixtures", task.fixture);
const context = readFileSync(join(fixtureDir, "CONTEXT.md"), "utf8");
const prdPath = join(fixtureDir, ".scratch", "prd.md");
const hasPrd = existsSync(prdPath);
const specLabel = hasPrd ? "The PRD the work product responds to" : "The brief the work product responds to";
const spec = hasPrd ? readFileSync(prdPath, "utf8") : task.prompt.replace(/^\/\S+\s*\n+/, "");
const artifactPatterns = task.gradeArtifacts ?? task.expectedArtifacts;
const criteria = task.rubric.map((r, i) => `${i + 1}. ${r}`).join("\n");
const keys = task.rubric.map((_, i) => `"c${i + 1}":<0-100>`).join(",");

const outDir = join(ROOT, "results", "grading", task.skill);
const map = JSON.parse(readFileSync(join(outDir, "map.json"), "utf8"));
const runId = map[blindId];
if (!runId) { console.error(`${blindId} not in map.json`); process.exit(1); }
const workDir = join(ROOT, "results", "work", runId);

const files = artifactPatterns.flatMap((p) => resolveArtifacts(workDir, p)).filter((rel) => {
  const ok = existsSync(join(workDir, rel));
  if (!ok) console.warn(`  [warn] ${runId}: missing artifact ${rel} — omitted from prompt`);
  return ok;
});
const artifact = files.map((rel) => `### FILE: ${rel}\n${readFileSync(join(workDir, rel), "utf8").trim()}`).join("\n\n");
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
writeFileSync(join(outDir, "prompts", `${blindId}.txt`), prompt);
console.log(`Regenerated ${blindId}.txt (${files.length} artifact file(s)) from ${runId}`);
