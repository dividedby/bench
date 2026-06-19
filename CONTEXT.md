# bench — domain glossary

Model × effort benchmark harness for Claude Code skills: runs skills headlessly across a `model × effort` grid, grades the artifacts, and aggregates scores into a cost/quality matrix.

## Glossary

**skill** — a named Claude Code capability being benchmarked (e.g. `software-design`, `to-prd`, `frontend-design`). A task declares which skill it exercises via `task.skill`.

**task** — a JSON file under `tasks/` that fully specifies one benchmark scenario: `id`, `prompt`, `skill`, `source`, `fixture`, `expectedArtifacts`/`gradeArtifacts`, `objectiveChecks`, and `rubric`. Tasks are the unit of enumeration in a sweep.

**fixture** — a synthetic repo under `fixtures/` that a skill operates on. Each fixture declares a local-markdown issue tracker so skills write files instead of calling `gh`. Fixtures are resettable; they carry domain `CONTEXT.md` files consumed by grading prompts.

**working copy** — an isolated copy of a fixture created per run under `results/work/<runId>/`. `run.mjs` copies the fixture fresh before each cell execution; `executeRun` receives the working copy as `workDir`.

**cell** — one unique `(task, model, effort, trial)` combination. The unit of execution. `runId` encodes the cell: `<taskId>__<model>__<effort>__t<trial>`.

**run** — one execution of a cell: a single `claude -p` invocation, the resulting `RunResult`, and the artifacts left in the working copy. Persisted to `results/runs/<runId>.json`.

**trial** — the repeat index within a cell (`trial=1` is the first execution of that `task × model × effort`). Multiple trials per cell support variance measurement.

**sweep** — enumeration and sequential execution of all cells in a `model × effort × task × trial` grid. Orchestrated by `sweep.mjs`; produces `results/aggregated.csv`.

**model** — one of `opus`, `sonnet`, `haiku` (pricing-dict keys that alias to the current Claude model versions). Passed to `claude --model`.

**effort** — Claude's thinking-effort level: `low`, `medium`, `high` (sweep defaults); `xhigh` and `max` also accepted. Passed to `claude --effort`.

**RunConfig** — the input to `executeRun`: `{ task, model, effort, trial, workDir, appendSystemPrompt? }`.

**RunResult** — the output of `executeRun`: `{ runId, task, config, startedAt, exitCode, metrics, modelUsage, result, raw? }`. Persisted (minus the full `result` field) to `results/runs/`.

**RunMetrics** — the cost/perf fields extracted from the CLI JSON envelope: `costUsd`, `durationMs`, `durationApiMs`, `wallMs`, `numTurns`, `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `isError`, `parseFailed`.

**modelUsage** — per-model-id token breakdown from the CLI envelope (`result.modelUsage`). Present when a skill spawns sub-agents or auxiliary model calls. Used by `rederiveCostUsd` for accurate per-model cost attribution; `total_cost_usd` in the envelope is the ground-truth harness cost.

**UNATTENDED** — the constant system prompt appended to every cell via `--append-system-prompt`. Tells the agent there is no user to answer checkpoints. Applied identically everywhere so it does not bias the model comparison.

**priceTokens** — pure function: prices a `TokenBundle` against one model's `PricingRates` (USD per million tokens). Assumes 5-minute cache for cache-write tokens.

**rederiveCostUsd** — pure function: re-derives API-equivalent cost as an independent check against `total_cost_usd`. Prefers the `modelUsage` breakdown; falls back to single-rate pricing of the primary model. Returns `null` when pricing is missing.

**pricing.json** — local rate table keyed by model alias (`opus`, `sonnet`, `haiku`), each with `input`, `output`, `cacheWrite5m`, `cacheRead` rates in USD per million tokens. Loaded by `sweep.mjs` and passed to `rederiveCostUsd`; never bundled into `@dividedby/bench-core`.

**blind ID** — a short opaque identifier (e.g. `SO-01`) assigned to a run before grading. The `blindId → runId` mapping is stored in `results/grading/<skill>/map.json` and kept private from judges to prevent model-identity bias.

**grade** — one judge's scores for one blind submission: `{ blindId, judge, scores: { c1…cN, overall, note } }`. Recorded in `results/grading/<skill>/grades.jsonl`.

**judge** — a named grader that produced a grade row. In `normalize`, a judge must have graded every blind cell (full coverage) to enter the normalized aggregate; partial-coverage judges are dropped.

**JudgeBackend** — the interface `{ name, grade(prompt, schema): Promise<GradeResult> }`. `createDefaultJudgeBackend` defers without calling a model; `createModelJudgeBackend` calls `claude -p` and parses the JSON reply.

**GradeResult** — `{ blindId, scores, prompt, graded }`. `graded: false` means the backend deferred (scores=null); `graded: true` means a model produced a JSON object (schema content not validated by the backend).

**normalize** — aggregates grades across judges using per-judge z-scoring of `overall` so wider-spread judges don't dominate. Returns `{ cells: NormalizedCell[], judges, dropped }`.

**NormalizedCell** — per-blind-submission aggregate: `{ blindId, judges, raws, rawMean, normZ, rankGap, disagree }`. `normZ` is the mean of per-judge z-scores; `disagree` flags cells where judges' rank positions differ by ≥ 4.

**groupByCell** — collapses normalized blind cells into `(model, effort)` cells across trials. Returns `GroupedCell[]` with `meanZ`, `trialStd`, `rawSpread`, and a `noisy` flag when trial-to-trial `normZ` std ≥ 0.5.

**grading prompt** — a self-contained text file under `results/grading/<skill>/prompts/<blindId>.txt` built by `build-grading-prompts.mjs`. Contains fixture `CONTEXT.md`, the task spec or PRD, the rubric, and the submission artifact(s), with a strict JSON reply instruction.

**@dividedby/bench-core** — the published ESM package. Contains only `core/**`: `executeRun`, `normalize`, `groupByCell`, `priceTokens`, `rederiveCostUsd`, `createDefaultJudgeBackend`, `createModelJudgeBackend`, `UNATTENDED`, `JUDGE_JSON_DIRECTIVE`. Zero runtime deps; hand-written types in `core/index.d.ts`. See ADR-0001.
