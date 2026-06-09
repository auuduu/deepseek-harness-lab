import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { runShellCommand } from "./shell.js";
import type { RepoSummary } from "../types/harness.js";

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".yaml",
  ".yml"
]);

const HIGH_SIGNAL_FILES = [
  "package.json",
  "vite.config.ts",
  "vite.config.js",
  "tsconfig.json",
  "src/main.tsx",
  "src/App.tsx",
  "src/index.ts",
  "index.html",
  "README.md"
];

export async function scanRepo(repoPath: string, task: string): Promise<RepoSummary> {
  const root = await resolveGitRoot(repoPath);
  const [currentBranch, statusOutput, files, packageScripts, packageManager] = await Promise.all([
    gitText(root, "git rev-parse --abbrev-ref HEAD", "unknown"),
    gitText(root, "git status --porcelain", ""),
    listRepoFiles(root),
    readPackageScripts(root),
    detectPackageManager(root)
  ]);

  const candidatePaths = chooseCandidateFiles(files, task);
  const candidateFiles = await Promise.all(
    candidatePaths.map(async (filePath) => ({
      path: filePath,
      reason: candidateReason(filePath, task),
      excerpt: await readExcerpt(root, filePath)
    }))
  );

  return {
    root,
    currentBranch: currentBranch.trim() || "unknown",
    isDirty: statusOutput.trim().length > 0,
    packageManager,
    packageScripts,
    files,
    candidateFiles
  };
}

export function renderRepoSummary(summary: RepoSummary): string {
  const scripts = Object.entries(summary.packageScripts)
    .map(([name, command]) => `- ${name}: ${command}`)
    .join("\n");
  const candidates = summary.candidateFiles
    .map((file) => `- ${file.path}: ${file.reason}`)
    .join("\n");
  return [
    `# Repo Summary`,
    ``,
    `- Root: ${summary.root}`,
    `- Branch: ${summary.currentBranch}`,
    `- Dirty: ${summary.isDirty ? "yes" : "no"}`,
    `- Package manager: ${summary.packageManager ?? "unknown"}`,
    `- Files indexed: ${summary.files.length}`,
    ``,
    `## Package Scripts`,
    scripts || "_No package scripts detected._",
    ``,
    `## Candidate Files`,
    candidates || "_No candidate files detected._"
  ].join("\n");
}

export function renderContextPack(summary: RepoSummary, task: string, testCommand?: string): string {
  const fileBlocks = summary.candidateFiles
    .map((file) => {
      const language = languageFor(file.path);
      return [
        `## ${file.path}`,
        ``,
        `Reason: ${file.reason}`,
        ``,
        `\`\`\`${language}`,
        file.excerpt ?? "",
        `\`\`\``
      ].join("\n");
    })
    .join("\n\n");
  return [
    `# Harness Context Pack`,
    ``,
    `Task: ${task}`,
    testCommand ? `Test command: ${testCommand}` : `Test command: _none provided_`,
    ``,
    renderRepoSummary(summary),
    ``,
    `# Candidate File Excerpts`,
    fileBlocks || "_No readable candidate files detected._"
  ].join("\n");
}

async function resolveGitRoot(repoPath: string): Promise<string> {
  const resolved = path.resolve(repoPath);
  const stats = await stat(resolved);
  if (!stats.isDirectory()) {
    throw new Error(`Repo path is not a directory: ${resolved}`);
  }
  const result = await runShellCommand("git rev-parse --show-toplevel", resolved, 30_000);
  if (result.code !== 0) {
    throw new Error(`Not a git repository: ${resolved}\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

async function gitText(root: string, command: string, fallback: string): Promise<string> {
  const result = await runShellCommand(command, root, 30_000);
  return result.code === 0 ? result.stdout.trimEnd() : fallback;
}

async function listRepoFiles(root: string): Promise<string[]> {
  const tracked = await runShellCommand("git ls-files", root, 30_000);
  const untracked = await runShellCommand("git ls-files --others --exclude-standard", root, 30_000);
  const files = `${tracked.stdout}\n${untracked.stdout}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !file.includes("node_modules/") && !file.startsWith(".harness-lab/"))
    .sort();
  return [...new Set(files)];
}

async function readPackageScripts(root: string): Promise<Record<string, string>> {
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

async function detectPackageManager(root: string): Promise<RepoSummary["packageManager"]> {
  if (await exists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(path.join(root, "yarn.lock"))) return "yarn";
  if (await exists(path.join(root, "package-lock.json"))) return "npm";
  if (await exists(path.join(root, "package.json"))) return "npm";
  return "unknown";
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function chooseCandidateFiles(files: string[], task: string): string[] {
  const lowerTask = task.toLowerCase();
  const keywords = lowerTask
    .split(/[^a-z0-9_\u4e00-\u9fff-]+/i)
    .filter((token) => token.length >= 3)
    .slice(0, 20);
  const scored = files
    .filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .map((file) => {
      const lowerFile = file.toLowerCase();
      let score = 0;
      if (HIGH_SIGNAL_FILES.includes(file)) score += 8;
      if (lowerFile.includes("readme")) score += 3;
      if (lowerFile.includes("test") || lowerFile.includes("spec")) score += 3;
      if (lowerFile.startsWith("src/")) score += 2;
      if (lowerFile.includes("app") || lowerFile.includes("main") || lowerFile.includes("index")) score += 2;
      for (const keyword of keywords) {
        if (lowerFile.includes(keyword)) score += 4;
      }
      return { file, score };
    })
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

  return scored.slice(0, 12).map((item) => item.file);
}

function candidateReason(filePath: string, task: string): string {
  const lower = filePath.toLowerCase();
  if (HIGH_SIGNAL_FILES.includes(filePath)) return "High-signal project entry/configuration file.";
  if (lower.includes("test") || lower.includes("spec")) return "Likely acceptance or regression test surface.";
  if (lower.includes("readme")) return "Project documentation often needs update context.";
  if (task.toLowerCase().split(/\s+/).some((token) => token.length > 3 && lower.includes(token))) {
    return "File path overlaps with task wording.";
  }
  return "Representative source file selected for repo context.";
}

async function readExcerpt(root: string, filePath: string): Promise<string> {
  try {
    const fullPath = path.join(root, filePath);
    const stats = await stat(fullPath);
    if (!stats.isFile() || stats.size > 200_000) {
      return `[skipped: file size ${stats.size} bytes]`;
    }
    const text = await readFile(fullPath, "utf8");
    const lines = text.split("\n");
    if (lines.length <= 900) return text;
    return `${lines.slice(0, 860).join("\n")}\n\n[excerpt truncated: ${lines.length - 860} lines omitted]`;
  } catch (error) {
    return `[unreadable: ${(error as Error).message}]`;
  }
}

function languageFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".tsx" || ext === ".ts") return "ts";
  if (ext === ".jsx" || ext === ".js" || ext === ".mjs" || ext === ".cjs") return "js";
  if (ext === ".json") return "json";
  if (ext === ".css") return "css";
  if (ext === ".html") return "html";
  if (ext === ".md") return "md";
  if (ext === ".py") return "py";
  return "";
}
