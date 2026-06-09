import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HarnessRun } from "../types/harness.js";

export function runsRoot(workspaceDir: string): string {
  return path.resolve(workspaceDir, ".harness-lab", "runs");
}

export function runDir(workspaceDir: string, runId: string): string {
  return path.join(runsRoot(workspaceDir), runId);
}

export async function ensureRunDir(workspaceDir: string, runId: string): Promise<string> {
  const dir = runDir(workspaceDir, runId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function saveRun(workspaceDir: string, run: HarnessRun): Promise<void> {
  const dir = await ensureRunDir(workspaceDir, run.runId);
  await writeFile(path.join(dir, "run.json"), JSON.stringify(run, null, 2), "utf8");
}

export async function saveRunArtifact(
  workspaceDir: string,
  runId: string,
  fileName: string,
  content: string
): Promise<void> {
  const dir = await ensureRunDir(workspaceDir, runId);
  await writeFile(path.join(dir, fileName), content, "utf8");
}

export async function loadRun(workspaceDir: string, runId: string): Promise<HarnessRun> {
  const text = await readFile(path.join(runDir(workspaceDir, runId), "run.json"), "utf8");
  return JSON.parse(text) as HarnessRun;
}

export async function listRuns(workspaceDir: string): Promise<HarnessRun[]> {
  try {
    const entries = await readdir(runsRoot(workspaceDir), { withFileTypes: true });
    const runs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            return await loadRun(workspaceDir, entry.name);
          } catch {
            return undefined;
          }
        })
    );
    return runs
      .filter((run): run is HarnessRun => Boolean(run))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch {
    return [];
  }
}
