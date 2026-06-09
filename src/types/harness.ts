export type RunStatus = "created" | "planning" | "executing" | "evaluating" | "completed" | "failed";

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type StepType =
  | "preflight"
  | "scan"
  | "plan"
  | "patch"
  | "command"
  | "evaluate"
  | "report";

export interface HarnessStep {
  id: string;
  type: StepType;
  title: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  command?: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface RepoSummary {
  root: string;
  currentBranch: string;
  isDirty: boolean;
  packageManager?: "npm" | "pnpm" | "yarn" | "unknown";
  packageScripts: Record<string, string>;
  files: string[];
  candidateFiles: Array<{
    path: string;
    reason: string;
    excerpt?: string;
  }>;
}

export interface HarnessPlan {
  objective: string;
  observations: string[];
  filesToInspect: string[];
  commands: string[];
  edits: Array<{
    path: string;
    intent: string;
  }>;
  acceptance: string[];
  risks: string[];
}

export interface PatchAttempt {
  iteration: number;
  patch: string;
  applied: boolean;
  error?: string;
}

export interface HarnessRun {
  runId: string;
  task: string;
  repoPath: string;
  testCommand?: string;
  mode: "auto";
  branchName?: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  repoSummary?: RepoSummary;
  plan?: HarnessPlan;
  steps: HarnessStep[];
  patches: PatchAttempt[];
  finalDiff?: string;
  finalSummary?: string;
  rollbackHint?: string;
  metrics: {
    model?: string;
    iterations: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface RunOptions {
  repoPath: string;
  task: string;
  testCommand?: string;
  mode: "auto";
  allowDirty: boolean;
  maxIterations: number;
  workspaceDir: string;
  provider: "deepseek" | "mock";
}

export interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface PlanInput {
  task: string;
  repoSummary: RepoSummary;
  testCommand?: string;
}

export interface PatchInput {
  task: string;
  repoSummary: RepoSummary;
  plan: HarnessPlan;
  previousError?: string;
  testOutput?: string;
}

export interface SummaryInput {
  run: HarnessRun;
}

export interface HarnessProvider {
  model: string;
  createPlan(input: PlanInput): Promise<{ plan: HarnessPlan; usage?: ModelUsage }>;
  createPatch(input: PatchInput): Promise<{ patch: string; usage?: ModelUsage }>;
  summarize(input: SummaryInput): Promise<{ summary: string; usage?: ModelUsage }>;
}
