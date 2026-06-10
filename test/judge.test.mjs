import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultJudgeBackend } from "../core/index.mjs";

test("default judge backend returns the documented GradeResult shape without a model call", async () => {
  const backend = createDefaultJudgeBackend({ blindId: "SD-01" });
  assert.equal(backend.name, "manual");
  const schema = { jsonKeys: ["c1", "overall", "note"] };
  const res = await backend.grade("PROMPT TEXT", schema);
  assert.equal(res.blindId, "SD-01");
  assert.equal(res.scores, null, "default backend defers scoring");
  assert.equal(res.graded, false);
  assert.equal(res.prompt, "PROMPT TEXT", "echoes the prompt back ungraded");
});

test("default judge backend honors a custom name", () => {
  const backend = createDefaultJudgeBackend({ name: "panel-stub" });
  assert.equal(backend.name, "panel-stub");
});
