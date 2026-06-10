import { test } from "node:test";
import assert from "node:assert/strict";
import { executeRun, UNATTENDED } from "../core/index.mjs";

const TASK = { id: "demo-task", skill: "demo", source: "synthetic", fixture: "demo-fix", prompt: "/demo do the thing" };

test("executeRun returns a run result via an injected fake runCli (no real claude spawn)", async () => {
  const calls = [];
  const fakeRunCli = ({ args, cwd }) => {
    calls.push({ args, cwd });
    return {
      status: 0,
      stdout: JSON.stringify({
        is_error: false,
        total_cost_usd: 0.42,
        duration_ms: 1234,
        duration_api_ms: 1000,
        num_turns: 7,
        usage: {
          input_tokens: 100, output_tokens: 200,
          cache_creation_input_tokens: 50, cache_read_input_tokens: 30,
        },
        modelUsage: { "claude-sonnet-4-6": { inputTokens: 100, outputTokens: 200 } },
      }),
      stderr: "",
    };
  };

  const r = await executeRun(
    { task: TASK, model: "sonnet", effort: "medium", trial: 2, workDir: "/tmp/demo-work" },
    { runCli: fakeRunCli },
  );

  assert.equal(r.runId, "demo-task__sonnet__medium__t2");
  assert.equal(r.exitCode, 0);
  assert.equal(r.config.trial, 2);
  assert.equal(r.metrics.costUsd, 0.42);
  assert.equal(r.metrics.durationMs, 1234);
  assert.equal(r.metrics.numTurns, 7);
  assert.equal(r.metrics.inputTokens, 100);
  assert.equal(r.metrics.outputTokens, 200);
  assert.equal(r.metrics.cacheCreationTokens, 50);
  assert.equal(r.metrics.cacheReadTokens, 30);
  assert.equal(r.metrics.isError, false);
  assert.deepEqual(r.modelUsage, { "claude-sonnet-4-6": { inputTokens: 100, outputTokens: 200 } });
  assert.equal(r.raw, undefined);

  // The CLI was invoked exactly once, in the given workDir, with the canonical args.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cwd, "/tmp/demo-work");
  assert.deepEqual(calls[0].args, [
    "-p", "/demo do the thing",
    "--model", "sonnet",
    "--effort", "medium",
    "--output-format", "json",
    "--permission-mode", "acceptEdits",
    "--append-system-prompt", UNATTENDED,
  ]);
});

test("executeRun defaults trial to 1 and reports parse failure on non-JSON stdout", async () => {
  const fakeRunCli = () => ({ status: 1, stdout: "not json", stderr: "boom" });
  const r = await executeRun(
    { task: TASK, model: "haiku", effort: "low", workDir: "/tmp/x" },
    { runCli: fakeRunCli },
  );
  assert.equal(r.runId, "demo-task__haiku__low__t1");
  assert.equal(r.config.trial, 1);
  assert.equal(r.metrics.parseFailed, true);
  assert.equal(r.exitCode, 1);
  assert.equal(r.raw.stdout, "not json");
  assert.equal(r.raw.stderr, "boom");
});
