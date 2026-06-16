// Opt-in NDJSON cost sink. Fires only when BENCH_COST_LOG points at a file.
// All errors are swallowed — this must never throw into a bench run.

import { appendFileSync } from "node:fs";

/**
 * Append one NDJSON cost line to the file named by BENCH_COST_LOG, if set.
 * Parses `stdout` as JSON and writes `{ total_cost_usd, num_turns, duration_ms }`.
 * No-op when BENCH_COST_LOG is unset/empty, stdout is unparseable, or
 * `total_cost_usd` is absent or not a number. All write errors are swallowed.
 * @param {string} stdout - raw stdout from a `claude -p --output-format json` spawn.
 * @returns {void}
 */
export function appendCostLog(stdout) {
  const logPath = process.env.BENCH_COST_LOG;
  if (!logPath) return;

  try {
    const result = JSON.parse(stdout);
    if (typeof result !== "object" || result === null) return;
    if (typeof result.total_cost_usd !== "number") return;
    const line =
      JSON.stringify({
        total_cost_usd: result.total_cost_usd,
        num_turns: result.num_turns ?? null,
        duration_ms: result.duration_ms ?? null,
      }) + "\n";
    appendFileSync(logPath, line, "utf8");
  } catch {
    // swallow parse failures + write errors
  }
}
