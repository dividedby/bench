// Grade aggregation primitives — the canonical home (moved from aggregate-grades.mjs).
// Multi-judge aggregation: judges run on different scales, so a raw mean would let the
// wider-spread judge dominate. We per-judge z-score `overall` across that judge's cells,
// then average the z-scores. Only judges with FULL coverage (graded every cell) enter the
// normalized aggregate — you can't normalize a partial judge, and this auto-excludes
// leftover/rejected partial passes without deleting data.

const DISAGREE_RANK_GAP = 4; // judges placing a cell >= this many rank positions
                             // apart (out of N cells) get flagged for review.

// Pure core. grades: [{ blindId, judge, scores:{overall,...} }]
// Returns { cells, judges, dropped } where each cell carries raw + normalized data.
export function normalize(grades) {
  const blindIds = [...new Set(grades.map((g) => g.blindId))];
  const allJudges = [...new Set(grades.map((g) => g.judge))];

  // A judge counts only if it graded every blindId exactly once.
  const fullJudges = [];
  const dropped = [];
  for (const j of allJudges) {
    const seen = grades.filter((g) => g.judge === j).map((g) => g.blindId);
    const uniq = new Set(seen);
    if (uniq.size === blindIds.length && seen.length === blindIds.length) fullJudges.push(j);
    else dropped.push({ judge: j, graded: uniq.size, of: blindIds.length });
  }

  // Per full judge: z-score and within-judge rank (1 = best) over its overalls.
  const perJudge = {}; // judge -> blindId -> { z, rank, raw }
  for (const j of fullJudges) {
    const rows = grades
      .filter((g) => g.judge === j)
      .map((g) => ({ blindId: g.blindId, raw: g.scores.overall }));
    const mean = rows.reduce((s, r) => s + r.raw, 0) / rows.length;
    const variance = rows.reduce((s, r) => s + (r.raw - mean) ** 2, 0) / rows.length;
    const std = Math.sqrt(variance);
    const ranked = [...rows].sort((a, b) => b.raw - a.raw);
    perJudge[j] = {};
    for (const r of rows) {
      const z = std === 0 ? 0 : (r.raw - mean) / std;
      const rank = ranked.findIndex((x) => x.blindId === r.blindId) + 1;
      perJudge[j][r.blindId] = { z, rank, raw: r.raw };
    }
  }

  const cells = blindIds.map((blindId) => {
    const zs = fullJudges.map((j) => perJudge[j][blindId].z);
    const ranks = fullJudges.map((j) => perJudge[j][blindId].rank);
    const raws = fullJudges.map((j) => perJudge[j][blindId].raw);
    const normZ = zs.reduce((s, x) => s + x, 0) / (zs.length || 1);
    const rawMean = raws.reduce((s, x) => s + x, 0) / (raws.length || 1);
    const rankGap = ranks.length > 1 ? Math.max(...ranks) - Math.min(...ranks) : 0;
    return {
      blindId,
      judges: fullJudges.length,
      raws, // raw overalls, ordered by fullJudges
      rawMean,
      normZ,
      rankGap,
      disagree: fullJudges.length > 1 && rankGap >= DISAGREE_RANK_GAP,
    };
  });

  cells.sort((a, b) => b.normZ - a.normZ);
  return { cells, judges: fullJudges, dropped };
}

const NOISY_TRIAL_STD = 0.5; // trial-to-trial std of normZ (judge-std units) above
                            // which a cell's score is wobbly enough to flag.

// Group normalized per-blind cells into (model,effort) cells across trials.
// resolve(blindId) -> { model, effort }. Reports trial spread = the run-variance signal.
export function groupByCell(blindCells, resolve) {
  const byCell = {};
  for (const bc of blindCells) {
    const { model, effort } = resolve(bc.blindId);
    const key = `${model}__${effort}`;
    (byCell[key] ??= { model, effort, trials: [] }).trials.push(bc);
  }
  const rows = Object.values(byCell).map((c) => {
    const zs = c.trials.map((t) => t.normZ);
    const rawMeans = c.trials.map((t) => t.rawMean);
    const meanZ = zs.reduce((s, x) => s + x, 0) / zs.length;
    const varZ = zs.reduce((s, x) => s + (x - meanZ) ** 2, 0) / zs.length;
    const trialStd = Math.sqrt(varZ);
    const rawSpread = Math.max(...rawMeans) - Math.min(...rawMeans);
    return {
      model: c.model, effort: c.effort, nTrials: c.trials.length,
      rawMeans, meanZ, trialStd, rawSpread,
      noisy: c.trials.length > 1 && trialStd >= NOISY_TRIAL_STD,
    };
  });
  rows.sort((a, b) => b.meanZ - a.meanZ);
  return rows;
}
