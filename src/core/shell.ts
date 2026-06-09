import { spawn } from "node:child_process";

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export function runShellCommand(
  command: string,
  cwd: string,
  timeoutMs = 120_000
): Promise<CommandResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += `\nCommand timed out after ${timeoutMs}ms.`;
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: trimOutput(redactSensitive(stdout)),
        stderr: trimOutput(redactSensitive(stderr)),
        durationMs: Date.now() - started
      });
    });
  });
}

export function trimOutput(value: string, maxLength = 16_000): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n\n[output truncated: ${value.length - maxLength} chars omitted]`;
}

export function quoteArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function redactSensitive(value: string): string {
  return value
    .replace(/(DEEPSEEK_API_KEY=)[^\s]+/gi, "$1[redacted]")
    .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9._-]{12,}/gi, "$1[redacted]")
    .replace(/(token["']?\s*[:=]\s*["']?)[A-Za-z0-9._-]{12,}/gi, "$1[redacted]")
    .replace(/(secret["']?\s*[:=]\s*["']?)[A-Za-z0-9._-]{12,}/gi, "$1[redacted]");
}
