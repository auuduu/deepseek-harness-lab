#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import { runHarness } from "../core/executor.js";
import type { RunOptions } from "../types/harness.js";

const program = new Command();

program
  .name("harness-lab")
  .description("DeepSeek Harness Lab CLI for repo-aware planning, patching, validation, and trace export.")
  .version("0.1.0");

program
  .command("run")
  .requiredOption("--repo <path>", "Target git repository path.")
  .requiredOption("--task <task>", "Natural-language task to execute.")
  .option("--test <command>", "Validation command to run after patching.")
  .option("--mode <mode>", "Execution mode. V1 supports auto only.", "auto")
  .option("--allow-dirty", "Allow running when target repo has uncommitted changes.", false)
  .option("--max-iterations <count>", "Maximum automatic repair iterations.", "3")
  .option("--workspace <path>", "Workspace for .harness-lab run artifacts.", process.cwd())
  .option("--provider <provider>", "Provider: deepseek or mock.", "deepseek")
  .action(async (raw) => {
    const provider = raw.provider as RunOptions["provider"];
    if (provider !== "deepseek" && provider !== "mock") {
      console.error("Invalid --provider. Use deepseek or mock.");
      process.exitCode = 2;
      return;
    }
    if (raw.mode !== "auto") {
      console.error("Invalid --mode. V1 supports --mode auto only.");
      process.exitCode = 2;
      return;
    }

    const options: RunOptions = {
      repoPath: path.resolve(raw.repo),
      task: raw.task,
      testCommand: raw.test,
      mode: "auto",
      allowDirty: Boolean(raw.allowDirty),
      maxIterations: Number.parseInt(raw.maxIterations, 10) || 3,
      workspaceDir: path.resolve(raw.workspace),
      provider
    };

    const run = await runHarness(options);
    const runDir = path.join(options.workspaceDir, ".harness-lab", "runs", run.runId);
    console.log(`Run ${run.runId}: ${run.status}`);
    console.log(`Artifacts: ${runDir}`);
    if (run.branchName) console.log(`Branch: ${run.branchName}`);
    if (run.finalSummary) console.log(`\n${run.finalSummary}`);
    if (run.rollbackHint) console.log(`\nRollback: ${run.rollbackHint}`);
    if (run.status !== "completed") {
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
