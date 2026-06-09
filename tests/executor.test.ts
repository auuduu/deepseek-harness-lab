import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runHarness } from "../src/core/executor.js";
import { loadRun } from "../src/core/run-store.js";
import { createGitFixture } from "./helpers.js";

let cleanupFns: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanupFns.map((cleanup) => cleanup()));
  cleanupFns = [];
});

describe("runHarness", () => {
  it("fixes the fixture with mock provider and writes trace artifacts", async () => {
    const fixture = await createGitFixture();
    cleanupFns.push(fixture.cleanup);
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "harness-workspace-"));
    cleanupFns.push(() => rm(workspaceDir, { recursive: true, force: true }));

    const run = await runHarness({
      repoPath: fixture.repoPath,
      task: "Fix the calculator add function so tests pass",
      testCommand: "npm test",
      mode: "auto",
      allowDirty: false,
      maxIterations: 3,
      workspaceDir,
      provider: "mock"
    });

    expect(run.status).toBe("completed");
    expect(run.branchName).toMatch(/^harness-lab\//);
    expect(run.finalDiff).toContain("return a + b");
    expect(await readFile(path.join(fixture.repoPath, "src/calculator.js"), "utf8")).toContain("return a + b");

    const persisted = await loadRun(workspaceDir, run.runId);
    expect(persisted.steps.some((step) => step.type === "command" && step.status === "completed")).toBe(true);
    expect(await readFile(path.join(workspaceDir, ".harness-lab", "runs", run.runId, "case-study.md"), "utf8")).toContain(
      "Product Insight"
    );
  });
});
