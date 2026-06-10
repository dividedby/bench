// JudgeBackend interface + a default no-model backend.
// The real Opus panel is a separate issue (#138) — this is the interface only.

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
