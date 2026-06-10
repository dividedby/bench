// Cost re-derivation primitives. Pure: pricing is passed IN — no file reads here.
// The sweep.mjs wrapper loads pricing.json and passes the dict to rederiveCostUsd.

/**
 * Price a single token bundle against one model's per-million rates.
 * @param {{input:number,output:number,cacheWrite5m:number,cacheRead:number}} pricingRates
 * @param {{input?:number,output?:number,cacheCreation?:number,cacheRead?:number}} tokens
 * @returns {number} USD cost for this bundle (assumes 5-minute cache).
 */
export function priceTokens(pricingRates, tokens) {
  const t = (n) => Number(n ?? 0) / 1e6;
  return (
    t(tokens.input) * pricingRates.input +
    t(tokens.output) * pricingRates.output +
    t(tokens.cacheCreation) * pricingRates.cacheWrite5m +
    t(tokens.cacheRead) * pricingRates.cacheRead
  );
}

function modelIdToKey(id) {
  if (id.includes("opus")) return "opus";
  if (id.includes("sonnet")) return "sonnet";
  if (id.includes("haiku")) return "haiku";
  return null;
}

/**
 * Re-derive API-equivalent cost as an independent check against the harness's
 * total_cost_usd. Prefers the per-model modelUsage breakdown (accurate for the
 * multi-model sessions these skills produce); falls back to single-rate pricing of
 * the primary-model aggregate when modelUsage is absent. Assumes 5m cache.
 * @param {string} primaryModel - pricing-dict key for the primary model (e.g. "opus").
 * @param {object} metrics - run metrics carrying inputTokens/outputTokens/cache* fields.
 * @param {object|null} modelUsage - per-model-id usage breakdown, or null.
 * @param {object} pricingDict - { opus:{...}, sonnet:{...}, ... } rate table.
 * @returns {number|null} re-derived USD, or null if pricing is missing for a model.
 */
export function rederiveCostUsd(primaryModel, metrics, modelUsage, pricingDict) {
  if (!pricingDict) return null;
  if (modelUsage && typeof modelUsage === "object") {
    let total = 0;
    for (const [id, u] of Object.entries(modelUsage)) {
      const p = pricingDict[modelIdToKey(id)];
      if (!p) return null;
      total += priceTokens(p, {
        input: u.inputTokens, output: u.outputTokens,
        cacheCreation: u.cacheCreationInputTokens, cacheRead: u.cacheReadInputTokens,
      });
    }
    return total;
  }
  const p = pricingDict[primaryModel];
  if (!p) return null;
  return priceTokens(p, {
    input: metrics.inputTokens, output: metrics.outputTokens,
    cacheCreation: metrics.cacheCreationTokens, cacheRead: metrics.cacheReadTokens,
  });
}
