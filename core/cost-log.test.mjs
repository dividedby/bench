import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendCostLog } from "./cost-log.mjs";

// Save and restore BENCH_COST_LOG around each test.
function withCostLog(filePath, fn) {
  const prev = process.env.BENCH_COST_LOG;
  if (filePath === undefined) {
    delete process.env.BENCH_COST_LOG;
  } else {
    process.env.BENCH_COST_LOG = filePath;
  }
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      delete process.env.BENCH_COST_LOG;
    } else {
      process.env.BENCH_COST_LOG = prev;
    }
  }
}

test("appends one NDJSON line when BENCH_COST_LOG is set and stdout is valid", () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-cost-log-"));
  const logFile = join(dir, "cost.ndjson");
  try {
    withCostLog(logFile, () => {
      appendCostLog(JSON.stringify({ total_cost_usd: 0.12, num_turns: 3, duration_ms: 100 }));
    });
    const lines = readFileSync(logFile, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), { total_cost_usd: 0.12, num_turns: 3, duration_ms: 100 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appends a second line on a second call (NDJSON accretion)", () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-cost-log-"));
  const logFile = join(dir, "cost.ndjson");
  try {
    withCostLog(logFile, () => {
      appendCostLog(JSON.stringify({ total_cost_usd: 0.12, num_turns: 3, duration_ms: 100 }));
      appendCostLog(JSON.stringify({ total_cost_usd: 0.05, num_turns: 1, duration_ms: 50 }));
    });
    const lines = readFileSync(logFile, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), { total_cost_usd: 0.12, num_turns: 3, duration_ms: 100 });
    assert.deepEqual(JSON.parse(lines[1]), { total_cost_usd: 0.05, num_turns: 1, duration_ms: 50 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("is a no-op when BENCH_COST_LOG is unset", () => {
  // No file created, no throw.
  withCostLog(undefined, () => {
    assert.doesNotThrow(() => {
      appendCostLog(JSON.stringify({ total_cost_usd: 0.99, num_turns: 2, duration_ms: 200 }));
    });
  });
});

test("does not throw on malformed stdout when BENCH_COST_LOG is set", () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-cost-log-"));
  const logFile = join(dir, "cost.ndjson");
  try {
    withCostLog(logFile, () => {
      assert.doesNotThrow(() => appendCostLog("not json"));
    });
    // File was never written (or is empty).
    let content;
    try {
      content = readFileSync(logFile, "utf8");
    } catch {
      content = "";
    }
    assert.equal(content.trim(), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writes nothing when JSON lacks total_cost_usd", () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-cost-log-"));
  const logFile = join(dir, "cost.ndjson");
  try {
    withCostLog(logFile, () => {
      appendCostLog(JSON.stringify({ foo: 1 }));
    });
    let content;
    try {
      content = readFileSync(logFile, "utf8");
    } catch {
      content = "";
    }
    assert.equal(content.trim(), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
