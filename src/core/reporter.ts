import type { HarnessRun } from "../types/harness.js";

export function renderCaseStudy(run: HarnessRun): string {
  const commands = run.steps
    .filter((step) => step.command)
    .map((step) => `- ${step.status.toUpperCase()} \`${step.command}\`: ${firstLine(step.output || step.error || "")}`)
    .join("\n");
  const timeline = run.steps
    .map((step) => {
      const detail = step.error ? ` - ${step.error}` : step.output ? ` - ${firstLine(step.output)}` : "";
      return `- ${step.status.toUpperCase()} ${step.title}${detail}`;
    })
    .join("\n");
  const patchSummary = run.patches
    .map((patch) => `- Iteration ${patch.iteration}: ${patch.applied ? "applied" : `failed (${patch.error ?? "unknown"})`}`)
    .join("\n");

  return [
    `# Case Study: ${run.task}`,
    ``,
    `## Problem`,
    `AI-heavy developers need a harness that can understand a real repo, make a bounded change, run validation, and leave behind an auditable trace instead of an opaque chat transcript.`,
    ``,
    `## Run Metadata`,
    `- Run ID: ${run.runId}`,
    `- Repo: ${run.repoPath}`,
    `- Branch: ${run.branchName ?? "not created"}`,
    `- Provider/model: ${run.metrics.model ?? "unknown"}`,
    `- Status: ${run.status}`,
    `- Started: ${run.startedAt}`,
    `- Completed: ${run.completedAt ?? "not completed"}`,
    ``,
    `## User Task`,
    run.task,
    ``,
    `## Plan`,
    run.plan
      ? [
          `Objective: ${run.plan.objective}`,
          ``,
          `Observations:`,
          ...run.plan.observations.map((item) => `- ${item}`),
          ``,
          `Edits:`,
          ...run.plan.edits.map((item) => `- ${item.path}: ${item.intent}`),
          ``,
          `Acceptance:`,
          ...run.plan.acceptance.map((item) => `- ${item}`)
        ].join("\n")
      : "_Plan was not produced._",
    ``,
    `## Trace`,
    timeline || "_No steps recorded._",
    ``,
    `## Patch Attempts`,
    patchSummary || "_No patch attempts recorded._",
    ``,
    `## Validation Commands`,
    commands || "_No validation commands recorded._",
    ``,
    `## Final Diff`,
    "```diff",
    run.finalDiff ?? "",
    "```",
    ``,
    `## Final Summary`,
    run.finalSummary ?? "_No final summary produced._",
    ``,
    `## Product Insight`,
    `The useful product surface is not only automatic code editing. The differentiator is the harness: repo context, command boundaries, failure classification, replayable traces, and a report that a reviewer or interviewer can audit.`,
    ``,
    `## Rollback`,
    run.rollbackHint ?? "_No rollback hint recorded._",
    ``
  ].join("\n");
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim().length > 0)?.trim().slice(0, 180) ?? "";
}
