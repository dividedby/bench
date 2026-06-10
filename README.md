# bench — model × effort benchmark for Claude Code skills

Goal: build a cost/quality matrix across `model × effort` for the skills used daily,
so the cheapest config above a chosen quality floor can be picked as the daily driver.

## `@dividedby/bench-core`

The reusable core primitives are published as `@dividedby/bench-core` (ESM, zero
runtime deps, hand-written types in `core/index.d.ts`). The CLIs in this repo
(`run.mjs`, `sweep.mjs`, `aggregate-grades.mjs`) are thin wrappers over them.

```js
import {
  executeRun,            // run one (task, model, effort) cell; injectable runCli
  normalize, groupByCell, // multi-judge grade aggregation
  priceTokens, rederiveCostUsd, // pure cost re-derivation (pricing passed in)
  createDefaultJudgeBackend,    // JudgeBackend interface + no-model default
} from "@dividedby/bench-core";
```

Only `core/**` ships in the package; fixtures, tasks, results, and pricing are
local-harness assets. Test: `npm test` (node's built-in runner, `node --test`).

## Status
- **Stage 1 (current):** scaffold + one synthetic task + single-run runner with metrics extraction.
- Stage 2: full sweep runner (model × effort × task, 1 trial) → `aggregated.csv`.
- Stage 3: grader (objective checks + LLM judge) → `report.md`.
- Stage 4: 3 trials, replayed-real tasks, variance flags.

## Axes
- Models: `opus`, `sonnet`, `haiku`
- Effort: `low`, `medium`, `high` (CLI also supports `xhigh`, `max`)

## How it works
Each run executes a skill headlessly in an isolated copy of a fixture repo:

```
claude -p "<prompt>" --model M --effort E \
  --output-format json --permission-mode acceptEdits \
  --append-system-prompt "<unattended constant>"   (cwd = working copy)
```

`--output-format json` returns `total_cost_usd`, `duration_ms`, `num_turns`, and token
usage directly — no transcript parsing needed. Artifacts left in the working copy are
graded later.

### Unattended constant
Every cell gets the same appended system prompt telling the agent it is running
unattended (no user to answer "check with the user" checkpoints). Applied identically
everywhere so it does not bias the model comparison. See `UNATTENDED` in `run.mjs`.

### Fixtures
Synthetic fixtures live in `fixtures/`. Each declares a **local-markdown** issue tracker
(`docs/agents/issue-tracker.md`) so skills like `/to-prd` write files instead of calling
`gh` — gradeable, resettable, zero external side effects.

## Run one
```
node run.mjs --task tasks/software-design-synthetic.json --model sonnet --effort medium
```
Outputs `results/runs/<runId>.json` (config + metrics) and leaves the worked copy under
`results/work/<runId>/`.
