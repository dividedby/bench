# ADR-0001 — core/CLI publish boundary

**Status:** Accepted

## Context

The bench repo serves two distinct consumers:

1. **External packages** that want the reusable benchmark primitives (`executeRun`, `normalize`, `groupByCell`, `priceTokens`, `rederiveCostUsd`, `createDefaultJudgeBackend`, `createModelJudgeBackend`) without pulling in the local harness machinery.
2. **The local harness** itself — the scripts (`run.mjs`, `sweep.mjs`, `aggregate-grades.mjs`, `build-grading-prompts.mjs`, `record-grade.mjs`) that orchestrate runs, manage the filesystem layout, and consume harness assets (`tasks/`, `fixtures/`, `results/`, `pricing.json`).

The primitives need to be publishable as a zero-dependency ESM package. The harness scripts, by contrast, do direct filesystem I/O against local paths, parse `process.argv`, and depend on assets that are not publishable (fixture repos, run results, a local pricing file). Bundling them into the package would create runtime dependencies on Node built-ins, local path assumptions, and non-general configuration — and would expose internal harness state to external consumers.

## Decision

Only `core/**` ships in the published `@dividedby/bench-core` package.

- `package.json` `"files": ["core"]` excludes everything else from the npm tarball.
- `package.json` `"exports": { ".": { "types": "./core/index.d.ts", "import": "./core/index.mjs" } }` exposes exactly one entry point.
- Types are hand-written in `core/index.d.ts`; source stays `.mjs` with no build step.
- The package declares zero runtime dependencies (`"dependencies"` key absent).

Everything outside `core/` — `run.mjs`, `sweep.mjs`, `aggregate-grades.mjs`, `build-grading-prompts.mjs`, `record-grade.mjs`, `tasks/`, `fixtures/`, `results/`, `pricing.json` — is a local-harness asset. These scripts import from `./core/index.mjs` as thin wrappers; they are not part of the published API.

## Consequences

- External consumers get a stable, minimal surface with no harness entanglement.
- Core primitives must remain pure (no `process.argv`, no direct `fs` reads of local paths, no pricing embedded). Pricing and file I/O belong in the wrapper scripts.
- Adding a new primitive to the public API requires changes to `core/index.mjs` and `core/index.d.ts` only; wrapper scripts remain untouched.
- The harness scripts are local-only and can import Node built-ins freely without worrying about the package consumer's environment.
