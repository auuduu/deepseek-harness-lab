import path from "node:path";
import { createBranchName, createRunId } from "./ids.js";
import { renderCaseStudy } from "./reporter.js";
import { renderContextPack, renderRepoSummary, scanRepo } from "./repo-scanner.js";
import { saveRun, saveRunArtifact } from "./run-store.js";
import { quoteArg, runShellCommand } from "./shell.js";
import { validateCommand } from "./safety.js";
import { createProvider } from "./providers/index.js";
import type { HarnessRun, HarnessStep, ModelUsage, PatchInput, RunOptions, StepStatus, StepType } from "../types/harness.js";

export async function runHarness(options: RunOptions): Promise<HarnessRun> {
  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const provider = createProvider(options.provider);
  const run: HarnessRun = {
    runId,
    task: options.task,
    repoPath: path.resolve(options.repoPath),
    testCommand: options.testCommand,
    mode: options.mode,
    status: "created",
    startedAt,
    steps: [],
    patches: [],
    metrics: {
      model: provider.model,
      iterations: 0
    }
  };

  const save = () => saveRun(options.workspaceDir, run);
  const addStep = async (type: StepType, title: string, metadata?: Record<string, unknown>) => {
    const step: HarnessStep = {
      id: `${String(run.steps.length + 1).padStart(2, "0")}-${type}`,
      type,
      title,
      status: "running",
      startedAt: new Date().toISOString(),
      metadata
    };
    run.steps.push(step);
    await save();
    return step;
  };
  const finishStep = async (
    step: HarnessStep,
    status: StepStatus,
    fields: Partial<Pick<HarnessStep, "output" | "error" | "command" | "metadata">> = {}
  ) => {
    Object.assign(step, fields, { status, completedAt: new Date().toISOString() });
    await save();
  };

  await save();

  try {
    run.status = "planning";
    await save();

    const preflight = await addStep("preflight", "Check repo state and create harness branch");
    const initialSummary = await scanRepo(run.repoPath, run.task);
    if (initialSummary.isDirty && !options.allowDirty) {
      throw new Error(
        "Target repo has uncommitted changes. Commit/stash them or pass --allow-dirty to run with explicit risk acceptance."
      );
    }
    const branchName = createBranchName(runId);
    const branchResult = await runShellCommand(`git switch -c ${quoteArg(branchName)}`, initialSummary.root, 30_000);
    if (branchResult.code !== 0) {
      throw new Error(branchResult.stderr || branchResult.stdout || `Failed to create branch ${branchName}`);
    }
    run.repoPath = initialSummary.root;
    run.branchName = branchName;
    run.rollbackHint = `git switch ${initialSummary.currentBranch} && git branch -D ${branchName}`;
    await finishStep(preflight, "completed", {
      output: `Created branch ${branchName} from ${initialSummary.currentBranch}.`,
      metadata: { originalBranch: initialSummary.currentBranch, branchName }
    });

    const scan = await addStep("scan", "Scan repo and build context pack");
    run.repoSummary = await scanRepo(run.repoPath, run.task);
    await saveRunArtifact(options.workspaceDir, runId, "repo-summary.md", renderRepoSummary(run.repoSummary));
    await saveRunArtifact(options.workspaceDir, runId, "context-pack.md", renderContextPack(run.repoSummary, run.task, run.testCommand));
    await finishStep(scan, "completed", {
      output: `Indexed ${run.repoSummary.files.length} files and selected ${run.repoSummary.candidateFiles.length} candidate files.`
    });

    const planStep = await addStep("plan", "Ask provider for structured plan");
    const planResult = await provider.createPlan({
      task: run.task,
      repoSummary: run.repoSummary,
      testCommand: run.testCommand
    });
    run.plan = planResult.plan;
    addUsage(run, planResult.usage);
    await saveRunArtifact(options.workspaceDir, runId, "plan.json", JSON.stringify(run.plan, null, 2));
    await finishStep(planStep, "completed", { output: JSON.stringify(run.plan, null, 2) });

    run.status = "executing";
    await save();

    let previousError: string | undefined;
    let testOutput: string | undefined;
    let validationPassed = false;
    const maxIterations = Math.max(1, options.maxIterations);

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      run.metrics.iterations = iteration;
      if (iteration > 1) {
        run.repoSummary = await scanRepo(run.repoPath, run.task);
      }
      const patchStep = await addStep("patch", `Generate and apply patch iteration ${iteration}`, { iteration });
      const patchInput: PatchInput = {
        task: run.task,
        repoSummary: run.repoSummary,
        plan: run.plan,
        previousError,
        testOutput
      };
      const patchResult = await provider.createPatch(patchInput);
      addUsage(run, patchResult.usage);
      await saveRunArtifact(options.workspaceDir, runId, `patch-${iteration}.diff`, patchResult.patch);

      const patchFileName = `patch-${iteration}.diff`;
      const patchFile = path.join(options.workspaceDir, ".harness-lab", "runs", runId, patchFileName);
      const check = await runSafeCommand(`git apply --check ${quoteArg(patchFile)}`, run.repoPath, patchStep);
      if (check.code !== 0) {
        previousError = check.stderr || check.stdout || "git apply --check failed";
        run.patches.push({ iteration, patch: patchResult.patch, applied: false, error: previousError });
        await finishStep(patchStep, "failed", { error: previousError });
        continue;
      }
      const apply = await runSafeCommand(`git apply ${quoteArg(patchFile)}`, run.repoPath, patchStep);
      if (apply.code !== 0) {
        previousError = apply.stderr || apply.stdout || "git apply failed";
        run.patches.push({ iteration, patch: patchResult.patch, applied: false, error: previousError });
        await finishStep(patchStep, "failed", { error: previousError });
        continue;
      }
      run.patches.push({ iteration, patch: patchResult.patch, applied: true });
      await finishStep(patchStep, "completed", { output: `Patch iteration ${iteration} applied.` });

      const commandResult = await runValidationCommands(run, options, addStep, finishStep);
      validationPassed = commandResult.ok;
      testOutput = commandResult.output;
      previousError = commandResult.ok ? undefined : commandResult.output;
      if (validationPassed) break;
    }

    run.status = "evaluating";
    await save();

    const evaluate = await addStep("evaluate", "Capture final diff and summarize run");
    const diff = await runShellCommand("git diff -- .", run.repoPath, 30_000);
    run.finalDiff = diff.stdout;
    await saveRunArtifact(options.workspaceDir, runId, "final.diff", run.finalDiff);

    if (!validationPassed && run.testCommand) {
      await finishStep(evaluate, "failed", { error: "Validation did not pass within max iterations." });
      throw new Error("Validation did not pass within max iterations.");
    }

    const summaryResult = await provider.summarize({ run });
    addUsage(run, summaryResult.usage);
    run.finalSummary = summaryResult.summary;
    await saveRunArtifact(options.workspaceDir, runId, "summary.md", summaryResult.summary);
    await finishStep(evaluate, "completed", { output: summaryResult.summary });

    run.status = "completed";
    run.completedAt = new Date().toISOString();
    await saveRunArtifact(options.workspaceDir, runId, "case-study.md", renderCaseStudy(run));
    await save();
    return run;
  } catch (error) {
    run.status = "failed";
    run.completedAt = new Date().toISOString();
    run.finalSummary = `Run failed: ${(error as Error).message}`;
    if (run.branchName && !run.rollbackHint) {
      run.rollbackHint = `git switch - && git branch -D ${run.branchName}`;
    }
    const currentStep = [...run.steps].reverse().find((step: HarnessStep) => step.status === "running");
    if (currentStep) {
      currentStep.status = "failed";
      currentStep.completedAt = new Date().toISOString();
      currentStep.error = (error as Error).message;
    }
    await saveRunArtifact(options.workspaceDir, runId, "case-study.md", renderCaseStudy(run));
    await save();
    return run;
  }
}

async function runValidationCommands(
  run: HarnessRun,
  options: RunOptions,
  addStep: (type: StepType, title: string, metadata?: Record<string, unknown>) => Promise<HarnessStep>,
  finishStep: (
    step: HarnessStep,
    status: StepStatus,
    fields?: Partial<Pick<HarnessStep, "output" | "error" | "command" | "metadata">>
  ) => Promise<void>
): Promise<{ ok: boolean; output?: string }> {
  const commands = uniqueCommands([...(run.plan?.commands ?? []), options.testCommand].filter(isString));
  if (commands.length === 0) return { ok: true, output: "No validation command configured." };

  let combinedOutput = "";
  for (const command of commands) {
    const step = await addStep("command", `Run validation command: ${command}`);
    const result = await runSafeCommand(command, run.repoPath, step);
    const output = formatCommandOutput(result.stdout, result.stderr);
    combinedOutput += `\n$ ${command}\n${output}\n`;
    await finishStep(step, result.code === 0 ? "completed" : "failed", {
      command,
      output,
      error: result.code === 0 ? undefined : `Command exited with code ${result.code}`
    });
    if (result.code !== 0) {
      return { ok: false, output: combinedOutput.trim() };
    }
  }
  return { ok: true, output: combinedOutput.trim() };
}

async function runSafeCommand(command: string, cwd: string, step: HarnessStep) {
  const safety = validateCommand(command);
  step.command = command;
  if (!safety.ok) {
    return {
      code: 126,
      stdout: "",
      stderr: safety.reason ?? "Command rejected by safety policy.",
      durationMs: 0
    };
  }
  return runShellCommand(command, cwd, 120_000);
}

function addUsage(run: HarnessRun, usage?: ModelUsage): void {
  if (!usage) return;
  run.metrics.promptTokens = addNumbers(run.metrics.promptTokens, usage.promptTokens);
  run.metrics.completionTokens = addNumbers(run.metrics.completionTokens, usage.completionTokens);
  run.metrics.totalTokens = addNumbers(run.metrics.totalTokens, usage.totalTokens);
}

function addNumbers(a?: number, b?: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function formatCommandOutput(stdout: string, stderr: string): string {
  return [stdout, stderr].filter(Boolean).join("\n").trim();
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueCommands(commands: string[]): string[] {
  return [...new Set(commands.map((command) => command.trim()))];
}
