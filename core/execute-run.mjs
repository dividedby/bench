// The run mechanic, decoupled from argv parsing and results/ persistence.
// executeRun spawns one `claude` invocation for one (task, model, effort, trial) cell
// and returns the parsed run metrics. Fixture copy + results write live in the run.mjs
// wrapper — this primitive only invokes the CLI and shapes the metrics.

import { spawnSync } from "node:child_process";
import { appendCostLog } from "./cost-log.mjs";

// Applied identically to EVERY cell so it does not bias the model comparison.
// The skills have "check with the user" checkpoints; in --print mode there is no user.
export const UNATTENDED =
  "You are running fully unattended in a benchmark harness. There is no user available " +
  "to answer questions or approve checkpoints. When a skill says to check with the user " +
  "or wait for confirmation, instead make the most reasonable assumption, state it briefly, " +
  "and proceed to completion. Do not ask questions. Finish the task and write all artifacts " +
  "to disk before ending your turn.";

// Default CLI runner: the real `claude` spawn. Tests inject a fake via deps.runCli.
// Returns { status, stdout, stderr } — the subset executeRun consumes.
function defaultRunCli({ args, cwd }) {
  const proc = spawnSync("claude", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  appendCostLog(proc.stdout);
  return { status: proc.status, stdout: proc.stdout, stderr: proc.stderr };
}

/**
 * Execute one benchmark cell.
 * @param {object} config
 * @param {{id:string,prompt:string,skill?:string,source?:string,fixture?:string}} config.task
 * @param {string} config.model
 * @param {string} config.effort
 * @param {number|string} [config.trial=1]
 * @param {string} config.workDir - cwd for the CLI (caller prepares the fixture copy here).
 * @param {string} [config.appendSystemPrompt=UNATTENDED]
 * @param {object} [deps]
 * @param {(opts:{args:string[],cwd:string})=>{status:number|null,stdout:string,stderr:string}} [deps.runCli]
 * @returns {Promise<object>} run record { runId, task, config, startedAt, exitCode, metrics, modelUsage, raw? }
 */
export async function executeRun(config, deps = {}) {
  const runCli = deps.runCli ?? defaultRunCli;
  const { task, model, effort, workDir } = config;
  const trial = config.trial ?? "1";
  const appendSystemPrompt = config.appendSystemPrompt ?? UNATTENDED;
  const runId = `${task.id}__${model}__${effort}__t${trial}`;

  const cliArgs = [
    "-p", task.prompt,
    "--model", model,
    "--effort", effort,
    "--output-format", "json",
    "--permission-mode", "acceptEdits",
    "--append-system-prompt", appendSystemPrompt,
  ];

  const startedAt = new Date().toISOString();
  const wall0 = Date.now();
  const proc = runCli({ args: cliArgs, cwd: workDir });
  const wallMs = Date.now() - wall0;

  let result = null;
  try {
    result = JSON.parse(proc.stdout);
  } catch {
    // leave result null; record raw stdout/stderr for debugging
  }

  const u = result?.usage ?? {};
  const metrics = result
    ? {
        isError: result.is_error ?? null,
        costUsd: result.total_cost_usd ?? null,
        durationMs: result.duration_ms ?? null,
        durationApiMs: result.duration_api_ms ?? null,
        wallMs,
        numTurns: result.num_turns ?? null,
        inputTokens: u.input_tokens ?? null,
        outputTokens: u.output_tokens ?? null,
        cacheCreationTokens: u.cache_creation_input_tokens ?? null,
        cacheReadTokens: u.cache_read_input_tokens ?? null,
      }
    : { parseFailed: true, wallMs };

  return {
    runId,
    task: { id: task.id, skill: task.skill, source: task.source, fixture: task.fixture },
    config: { model, effort, trial: Number(trial) },
    startedAt,
    exitCode: proc.status,
    metrics,
    // Per-model token breakdown — total_cost_usd spans every model used in the session
    // (sub-agents, auxiliary calls), so this is needed to re-derive cost accurately.
    modelUsage: result?.modelUsage ?? null,
    // The full parsed CLI result (modelUsage, server tool use, etc.) for the wrapper to
    // persist for introspection. null when stdout didn't parse as JSON.
    result,
    // Present only on parse failure, for the wrapper to persist for debugging.
    raw: result ? undefined : { stdout: proc.stdout?.slice(0, 4000), stderr: proc.stderr?.slice(0, 4000) },
  };
}
