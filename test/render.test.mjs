import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, fmtCost, fmtZ, gridFor, renderHtml } from "../site/render.mjs";

test("escapeHtml neutralizes markup", () => {
  assert.equal(escapeHtml('<b>&"\'</b>'), "&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
});

test("fmtCost and fmtZ format numbers and handle null", () => {
  assert.equal(fmtCost(0.5), "$0.500");
  assert.equal(fmtCost(null), "—");
  assert.equal(fmtZ(0.42), "+0.42");
  assert.equal(fmtZ(-0.42), "-0.42");
  assert.equal(fmtZ(null), "—");
});

test("gridFor renders model rows × effort columns with cost + z", () => {
  const skill = {
    skill: "demo",
    cells: [
      { model: "opus", effort: "high", costUsd: 0.5, meanZ: 0.8, noisy: false },
      { model: "haiku", effort: "low", costUsd: 0.1, meanZ: -0.8, noisy: true },
    ],
  };
  const html = gridFor(skill);
  assert.ok(html.includes("$0.500") && html.includes("z +0.80"));
  assert.ok(html.includes("$0.100") && html.includes("z -0.80"));
  assert.ok(html.includes('class="flag"'), "noisy cell flagged");
  // empty (opus,low) cell rendered as a placeholder
  assert.ok(html.includes('class="empty"'));
});

test("renderHtml emits a full document with one section per skill", () => {
  const data = {
    generatedAt: "2026-01-01T00:00:00Z",
    skills: [
      { skill: "alpha", cells: [{ model: "opus", effort: "high", costUsd: 0.5, meanZ: 0.1, noisy: false }] },
      { skill: "beta", cells: [{ model: "haiku", effort: "low", costUsd: 0.1, meanZ: null, noisy: null }] },
    ],
  };
  const html = renderHtml(data);
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("<h2>alpha</h2>") && html.includes("<h2>beta</h2>"));
  assert.ok(html.includes("2026-01-01T00:00:00Z"));
});
