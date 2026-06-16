// JudgeBackend interface + a default no-model backend + a model-calling backend.
// The default backend defers (no model); createModelJudgeBackend calls `claude -p`.

import { spawnSync } from "node:child_process";
import { appendCostLog } from "./cost-log.mjs";

/**
 * @typedef {object} GradeResult
 * @property {string} blindId   - the blind submission id being graded.
 * @property {object|null} scores - rubric scores ({ c1..cN, overall, note }), or null
 *                                  when no model graded (the default backend defers).
 * @property {string} prompt    - the exact prompt that would be sent to a judge model.
 * @property {boolean} graded   - true if a model produced scores; false if deferred.
 */

/**
 * @typedef {object} JudgeBackend
 * @property {string} name
 * @property {(prompt:string, schema:object)=>Promise<GradeResult>} grade
 *   Grade one blind prompt against a JSON schema. A real backend calls a model and
 *   parses its JSON reply into `scores`; the default backend defers (scores=null).
 */

/**
 * Default no-model backend: emits/stores the prompt without calling a model, mirroring
 * today's manual external-grading flow. `grade` echoes the prompt back ungraded so a
 * human (or a later panel backend) can score it.
 * @param {{name?:string, blindId?:string}} [opts]
 * @returns {JudgeBackend}
 */
export function createDefaultJudgeBackend(opts = {}) {
  const name = opts.name ?? "manual";
  return {
    name,
    async grade(prompt, _schema) {
      return {
        blindId: opts.blindId ?? null,
        scores: null,
        prompt,
        graded: false,
      };
    },
  };
}

// Appended as a system prompt so the judge replies with parseable JSON and nothing else.
// Exported (like execute-run's UNATTENDED) so tests can assert the schema is embedded.
export const JUDGE_JSON_DIRECTIVE =
  "You are a benchmark judge. Respond with ONLY a single JSON object matching this schema " +
  "and no prose, no markdown, no explanation — just the raw JSON object. Schema: ";

// Default CLI runner for the model judge: the real `claude` spawn. Tests inject a fake
// via opts.runCli. Returns { status, stdout, stderr } — the subset grade consumes.
// Duplicated locally (not imported from execute-run) because the grading args differ.
function defaultRunCli({ args, cwd }, timeout) {
  const proc = spawnSync("claude", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout,
  });
  appendCostLog(proc.stdout);
  return { status: proc.status, stdout: proc.stdout, stderr: proc.stderr };
}

/**
 * Model-calling backend: invokes `claude -p` to grade one blind prompt against a JSON
 * schema, parsing the model's JSON reply into `scores`. On any failure (non-zero exit,
 * unparseable envelope, unparseable answer) it DEFERS — returns the same ungraded
 * GradeResult the default backend does (scores=null, graded=false), never throwing and
 * never fabricating scores. This preserves the GradeResult defer contract so downstream
 * consumers keep their surface-don't-launder behavior. `graded:true` means only "a model
 * produced a JSON object" — schema keys are NOT validated here; the caller validates content.
 * @param {object} [opts]
 * @param {string} [opts.name="model"]
 * @param {string} [opts.blindId]
 * @param {string} [opts.model="opus"] - judge tier (ADR 0008); passed to --model.
 * @param {number} [opts.timeoutMs=120000] - spawnSync timeout.
 * @param {string} [opts.cwd] - cwd for the CLI (may be undefined).
 * @param {(opts:{args:string[],cwd:string})=>{status:number|null,stdout:string,stderr:string}} [opts.runCli]
 * @returns {JudgeBackend}
 */
export function createModelJudgeBackend(opts = {}) {
  const name = opts.name ?? "model";
  const model = opts.model ?? "opus";
  const timeoutMs = opts.timeoutMs ?? 120000;
  const runCli = opts.runCli ?? ((inv) => defaultRunCli(inv, timeoutMs));

  return {
    name,
    async grade(prompt, schema) {
      const deferred = {
        blindId: opts.blindId ?? null,
        scores: null,
        prompt,
        graded: false,
      };

      const args = [
        "-p", prompt,
        "--model", model,
        "--output-format", "json",
        "--append-system-prompt", JUDGE_JSON_DIRECTIVE + JSON.stringify(schema),
      ];

      const proc = runCli({ args, cwd: opts.cwd });
      if (proc.status !== 0 || proc.status == null) return deferred;

      let envelope;
      try {
        envelope = JSON.parse(proc.stdout);
      } catch {
        return deferred;
      }
      if (typeof envelope?.result !== "string") return deferred;

      const scores = parseModelJson(envelope.result);
      if (scores === null) return deferred;

      return {
        blindId: opts.blindId ?? null,
        scores,
        prompt,
        graded: true,
      };
    },
  };
}

// Parse a model's text answer into a JSON object. Robust to markdown code fences: on a
// direct parse failure, fall back to the substring from the first `{` to the last `}`.
// Returns the parsed object, or null when unparseable or not a non-null object.
function parseModelJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) return null;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  return parsed;
}
