import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultJudgeBackend, createModelJudgeBackend, JUDGE_JSON_DIRECTIVE } from "../core/index.mjs";

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

const SCHEMA = { jsonKeys: ["A_x", "B_x"] };

test("model judge backend grades via an injected fake runCli (happy path)", async () => {
  const calls = [];
  const fakeRunCli = ({ args, cwd }) => {
    calls.push({ args, cwd });
    return { status: 0, stdout: JSON.stringify({ result: JSON.stringify({ A_x: 3, B_x: 1 }) }), stderr: "" };
  };
  const backend = createModelJudgeBackend({ blindId: "SD-02", runCli: fakeRunCli });
  assert.equal(backend.name, "model");

  const res = await backend.grade("GRADE THIS", SCHEMA);
  assert.equal(res.graded, true);
  assert.deepEqual(res.scores, { A_x: 3, B_x: 1 });
  assert.equal(res.blindId, "SD-02");
  assert.equal(res.prompt, "GRADE THIS");

  assert.equal(calls.length, 1);
  const args = calls[0].args;
  const pIdx = args.indexOf("-p");
  assert.equal(args[pIdx + 1], "GRADE THIS");
  const mIdx = args.indexOf("--model");
  assert.equal(args[mIdx + 1], "opus", "defaults to the opus judge tier");
  const ofIdx = args.indexOf("--output-format");
  assert.equal(args[ofIdx + 1], "json");
  const asIdx = args.indexOf("--append-system-prompt");
  assert.ok(args[asIdx + 1].startsWith(JUDGE_JSON_DIRECTIVE));
  assert.ok(args[asIdx + 1].includes(JSON.stringify(SCHEMA)), "embeds the stringified schema");
});

test("model judge backend passes a custom model opt through to --model", async () => {
  const calls = [];
  const fakeRunCli = ({ args }) => {
    calls.push(args);
    return { status: 0, stdout: JSON.stringify({ result: JSON.stringify({ A_x: 2 }) }), stderr: "" };
  };
  const backend = createModelJudgeBackend({ model: "sonnet", runCli: fakeRunCli });
  await backend.grade("X", SCHEMA);
  const mIdx = calls[0].indexOf("--model");
  assert.equal(calls[0][mIdx + 1], "sonnet");
});

test("model judge backend defers on non-zero exit status", async () => {
  const fakeRunCli = () => ({ status: 1, stdout: "", stderr: "boom" });
  const backend = createModelJudgeBackend({ blindId: "SD-03", runCli: fakeRunCli });
  const res = await backend.grade("X", SCHEMA);
  assert.equal(res.graded, false);
  assert.equal(res.scores, null);
  assert.equal(res.blindId, "SD-03");
});

test("model judge backend defers when the CLI envelope is not JSON", async () => {
  const fakeRunCli = () => ({ status: 0, stdout: "not json", stderr: "" });
  const backend = createModelJudgeBackend({ runCli: fakeRunCli });
  const res = await backend.grade("X", SCHEMA);
  assert.equal(res.graded, false);
  assert.equal(res.scores, null);
});

test("model judge backend defers when the inner result is not JSON", async () => {
  const fakeRunCli = () => ({ status: 0, stdout: JSON.stringify({ result: "I cannot do that" }), stderr: "" });
  const backend = createModelJudgeBackend({ runCli: fakeRunCli });
  const res = await backend.grade("X", SCHEMA);
  assert.equal(res.graded, false);
  assert.equal(res.scores, null);
});

test("model judge backend strips markdown fences around the inner result", async () => {
  const fenced = "```json\n" + JSON.stringify({ A_x: 4, B_x: 5 }) + "\n```";
  const fakeRunCli = () => ({ status: 0, stdout: JSON.stringify({ result: fenced }), stderr: "" });
  const backend = createModelJudgeBackend({ runCli: fakeRunCli });
  const res = await backend.grade("X", SCHEMA);
  assert.equal(res.graded, true);
  assert.deepEqual(res.scores, { A_x: 4, B_x: 5 });
});
