// Hand-written types for @dividedby/bench-core. Sources stay .mjs; these declare the
// exported primitives so a TS consumer typechecks cleanly.

// ---- execute-run ----

export interface TaskDef {
  id: string;
  prompt: string;
  skill?: string;
  source?: string;
  fixture?: string;
}

export interface RunConfig {
  task: TaskDef;
  model: string;
  effort: string;
  trial?: number | string;
  /** cwd for the CLI; the caller prepares the fixture copy here. */
  workDir: string;
  appendSystemPrompt?: string;
}

export interface CliInvocation {
  args: string[];
  cwd: string;
}

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type RunCli = (invocation: CliInvocation) => CliResult;

export interface RunDeps {
  /** Defaults to the real `claude` spawnSync wrapper. */
  runCli?: RunCli;
}

export interface RunMetrics {
  isError?: boolean | null;
  costUsd?: number | null;
  durationMs?: number | null;
  durationApiMs?: number | null;
  wallMs: number;
  numTurns?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheCreationTokens?: number | null;
  cacheReadTokens?: number | null;
  parseFailed?: boolean;
}

export interface RunResult {
  runId: string;
  task: { id: string; skill?: string; source?: string; fixture?: string };
  config: { model: string; effort: string; trial: number };
  startedAt: string;
  exitCode: number | null;
  metrics: RunMetrics;
  modelUsage: Record<string, unknown> | null;
  /** Full parsed CLI result for introspection; null when stdout didn't parse. */
  result: Record<string, unknown> | null;
  raw?: { stdout?: string; stderr?: string };
}

export declare const UNATTENDED: string;
export declare function executeRun(config: RunConfig, deps?: RunDeps): Promise<RunResult>;

// ---- aggregate ----

export interface Grade {
  blindId: string;
  judge: string;
  scores: { overall: number; [criterion: string]: number | string };
}

export interface NormalizedCell {
  blindId: string;
  judges: number;
  raws: number[];
  rawMean: number;
  normZ: number;
  rankGap: number;
  disagree: boolean;
}

export interface DroppedJudge {
  judge: string;
  graded: number;
  of: number;
}

export interface NormalizeResult {
  cells: NormalizedCell[];
  judges: string[];
  dropped: DroppedJudge[];
}

export declare function normalize(grades: Grade[]): NormalizeResult;

export interface BlindCell {
  blindId: string;
  normZ: number;
  rawMean: number;
}

export type CellResolver = (blindId: string) => { model: string; effort: string };

export interface GroupedCell {
  model: string;
  effort: string;
  nTrials: number;
  rawMeans: number[];
  meanZ: number;
  trialStd: number;
  rawSpread: number;
  noisy: boolean;
}

export declare function groupByCell(
  blindCells: BlindCell[],
  resolve: CellResolver,
): GroupedCell[];

// ---- cost ----

export interface PricingRates {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheRead: number;
}

export type PricingDict = Record<string, PricingRates>;

export interface TokenBundle {
  input?: number;
  output?: number;
  cacheCreation?: number;
  cacheRead?: number;
}

export declare function priceTokens(pricingRates: PricingRates, tokens: TokenBundle): number;

export interface CostMetrics {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheCreationTokens?: number | null;
  cacheReadTokens?: number | null;
}

export interface ModelUsageEntry {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export declare function rederiveCostUsd(
  primaryModel: string,
  metrics: CostMetrics,
  modelUsage: Record<string, ModelUsageEntry> | null,
  pricingDict: PricingDict | null,
): number | null;

// ---- judge ----

export interface GradeResult {
  blindId: string | null;
  scores: Record<string, number | string> | null;
  prompt: string;
  graded: boolean;
}

export interface JudgeBackend {
  name: string;
  grade(prompt: string, schema: object): Promise<GradeResult>;
}

export declare function createDefaultJudgeBackend(opts?: {
  name?: string;
  blindId?: string;
}): JudgeBackend;

export declare const JUDGE_JSON_DIRECTIVE: string;

export declare function createModelJudgeBackend(opts?: {
  name?: string;
  blindId?: string;
  model?: string;
  timeoutMs?: number;
  cwd?: string;
  runCli?: (invocation: { args: string[]; cwd: string }) => {
    status: number | null;
    stdout: string;
    stderr: string;
  };
}): JudgeBackend;
