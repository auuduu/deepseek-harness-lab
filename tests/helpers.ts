import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runShellCommand } from "../src/core/shell.js";

export async function createGitFixture(): Promise<{ repoPath: string; cleanup: () => Promise<void> }> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "harness-lab-"));
  const repoPath = path.join(tempRoot, "repo");
  await cp(path.resolve("fixtures/bug-repo"), repoPath, { recursive: true });
  await runShellCommand("git init", repoPath);
  await runShellCommand("git config user.email test@example.com", repoPath);
  await runShellCommand("git config user.name Harness Test", repoPath);
  await runShellCommand("git add .", repoPath);
  await runShellCommand("git commit -m initial", repoPath);
  return {
    repoPath,
    cleanup: () => rm(tempRoot, { recursive: true, force: true })
  };
}
