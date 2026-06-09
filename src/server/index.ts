import { access, readFile } from "node:fs/promises";
import path from "node:path";
import cors from "cors";
import express from "express";
import { runHarness } from "../core/executor.js";
import { listRuns, loadRun, runDir } from "../core/run-store.js";
import type { RunOptions } from "../types/harness.js";

const app = express();
const port = Number(process.env.HARNESS_API_PORT || 8787);
const workspaceDir = path.resolve(process.env.HARNESS_WORKSPACE || process.cwd());

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, workspaceDir });
});

app.get("/api/runs", async (_req, res, next) => {
  try {
    res.json(await listRuns(workspaceDir));
  } catch (error) {
    next(error);
  }
});

app.get("/api/runs/:id", async (req, res, next) => {
  try {
    res.json(await loadRun(workspaceDir, req.params.id));
  } catch (error) {
    next(error);
  }
});

app.get("/api/runs/:id/artifacts/:name", async (req, res, next) => {
  try {
    const safeName = path.basename(req.params.name);
    const artifactPath = path.join(runDir(workspaceDir, req.params.id), safeName);
    res.type(contentTypeFor(safeName)).send(await readFile(artifactPath, "utf8"));
  } catch (error) {
    next(error);
  }
});

app.post("/api/runs", async (req, res, next) => {
  try {
    const body = req.body as Partial<RunOptions>;
    if (!body.repoPath || !body.task) {
      res.status(400).json({ error: "repoPath and task are required." });
      return;
    }
    const provider = body.provider === "mock" ? "mock" : "deepseek";
    const run = await runHarness({
      repoPath: body.repoPath,
      task: body.task,
      testCommand: body.testCommand,
      mode: "auto",
      allowDirty: Boolean(body.allowDirty),
      maxIterations: body.maxIterations ?? 3,
      workspaceDir,
      provider
    });
    res.status(run.status === "completed" ? 201 : 500).json(run);
  } catch (error) {
    next(error);
  }
});

const uiDist = path.resolve(process.cwd(), "ui-dist");
if (await exists(uiDist)) {
  app.use(express.static(uiDist));
  app.use((_req, res) => {
    res.sendFile(path.join(uiDist, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: message });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Harness API listening on http://127.0.0.1:${port}`);
  console.log(`Workspace: ${workspaceDir}`);
});

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function contentTypeFor(fileName: string): string {
  if (fileName.endsWith(".json")) return "application/json";
  if (fileName.endsWith(".diff")) return "text/x-diff";
  if (fileName.endsWith(".md")) return "text/markdown";
  return "text/plain";
}
