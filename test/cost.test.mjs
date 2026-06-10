import { test } from "node:test";
import assert from "node:assert/strict";
import { priceTokens, rederiveCostUsd } from "../core/index.mjs";

const PRICING = {
  opus:   { input: 5, output: 25, cacheWrite5m: 6.25, cacheRead: 0.50 },
  sonnet: { input: 3, output: 15, cacheWrite5m: 3.75, cacheRead: 0.30 },
  haiku:  { input: 1, output: 5,  cacheWrite5m: 1.25, cacheRead: 0.10 },
};

test("priceTokens computes per-million-rate cost across all four token kinds", () => {
  // 1M input @5 + 1M output @25 + 1M cacheWrite @6.25 + 1M cacheRead @0.50 = 36.75
  const c = priceTokens(PRICING.opus, { input: 1e6, output: 1e6, cacheCreation: 1e6, cacheRead: 1e6 });
  assert.equal(c, 36.75);
});

test("priceTokens treats missing token fields as zero", () => {
  const c = priceTokens(PRICING.sonnet, { input: 2e6 }); // 2M * 3 = 6
  assert.equal(c, 6);
});

test("rederiveCostUsd sums per-model modelUsage when present", () => {
  const modelUsage = {
    "claude-opus-4-8":   { inputTokens: 1e6, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    "claude-haiku-4-5":  { inputTokens: 0, outputTokens: 1e6, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
  };
  const c = rederiveCostUsd("opus", {}, modelUsage, PRICING); // opus input 5 + haiku output 5 = 10
  assert.equal(c, 10);
});

test("rederiveCostUsd falls back to primary-model aggregate when modelUsage absent", () => {
  const metrics = { inputTokens: 1e6, outputTokens: 1e6, cacheCreationTokens: 0, cacheReadTokens: 0 };
  const c = rederiveCostUsd("sonnet", metrics, null, PRICING); // 1M*3 + 1M*15 = 18
  assert.equal(c, 18);
});

test("rederiveCostUsd returns null when pricing dict missing or lacks a model", () => {
  assert.equal(rederiveCostUsd("opus", {}, null, null), null);
  assert.equal(rederiveCostUsd("nope", { inputTokens: 1 }, null, PRICING), null);
  // unknown model id in modelUsage -> null
  const c = rederiveCostUsd("opus", {}, { "gpt-x": { inputTokens: 1 } }, PRICING);
  assert.equal(c, null);
});
