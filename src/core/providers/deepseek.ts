import { z } from "zod";
import { parseJsonObject } from "../json.js";
import type {
  HarnessPlan,
  HarnessProvider,
  ModelUsage,
  PatchInput,
  PlanInput,
  SummaryInput
} from "../../types/harness.js";

const DEFAULT_MODEL = "deepseek-v4-flash";
const API_URL = "https://api.deepseek.com/chat/completions";

const PlanSchema = z.object({
  objective: z.string(),
  observations: z.array(z.string()).default([]),
  filesToInspect: z.array(z.string()).default([]),
  commands: z.array(z.string()).default([]),
  edits: z.array(z.object({ path: z.string(), intent: z.string() })).default([]),
  acceptance: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([])
});

const PatchSchema = z.object({
  patch: z.string().min(1)
});

const SummarySchema = z.object({
  summary: z.string().min(1)
});

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

export class DeepSeekProvider implements HarnessProvider {
  readonly model: string;

  constructor(model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL) {
    this.model = model;
  }

  async createPlan(input: PlanInput): Promise<{ plan: HarnessPlan; usage?: ModelUsage }> {
    const response = await this.chatJson(
      [
        systemMessage(),
        {
          role: "user",
          content: [
            "Create a concise execution plan for the coding harness.",
            "Return JSON only with keys: objective, observations, filesToInspect, commands, edits, acceptance, risks.",
            "Commands must be local inspection or package-script commands only. Do not propose network downloads, sudo, destructive git operations, or shell pipelines.",
            "",
            `Task:\n${input.task}`,
            "",
            `Test command:\n${input.testCommand ?? "(none)"}`,
            "",
            `Repo summary:\n${JSON.stringify(input.repoSummary, null, 2)}`
          ].join("\n")
        }
      ],
      "plan"
    );
    return { plan: PlanSchema.parse(parseJsonObject(response.content, "DeepSeek plan")), usage: response.usage };
  }

  async createPatch(input: PatchInput): Promise<{ patch: string; usage?: ModelUsage }> {
    const response = await this.chatJson(
      [
        systemMessage(),
        {
          role: "user",
          content: [
            "Generate a unified diff patch for git apply.",
            "Return JSON only: {\"patch\":\"...\"}.",
            "Patch paths must be relative to the repo root and use a/ and b/ prefixes.",
            "Only edit files needed for the task. Do not include explanations outside JSON.",
            "",
            `Task:\n${input.task}`,
            "",
            `Plan:\n${JSON.stringify(input.plan, null, 2)}`,
            "",
            input.previousError ? `Previous error:\n${input.previousError}` : "",
            input.testOutput ? `Test output:\n${input.testOutput}` : "",
            "",
            `Repo context:\n${JSON.stringify(input.repoSummary, null, 2)}`
          ].join("\n")
        }
      ],
      "patch"
    );
    return { patch: PatchSchema.parse(parseJsonObject(response.content, "DeepSeek patch")).patch, usage: response.usage };
  }

  async summarize(input: SummaryInput): Promise<{ summary: string; usage?: ModelUsage }> {
    const response = await this.chatJson(
      [
        systemMessage(),
        {
          role: "user",
          content: [
            "Summarize this harness run as a PR-ready acceptance summary.",
            "Return JSON only: {\"summary\":\"...\"}.",
            "Include what changed, validation result, residual risks, and rollback.",
            "",
            JSON.stringify(input.run, null, 2)
          ].join("\n")
        }
      ],
      "summary"
    );
    return {
      summary: SummarySchema.parse(parseJsonObject(response.content, "DeepSeek summary")).summary,
      usage: response.usage
    };
  }

  private async chatJson(
    messages: Array<{ role: "system" | "user"; content: string }>,
    label: string
  ): Promise<{ content: string; usage?: ModelUsage }> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required for provider=deepseek. Use provider=mock for local fixture demos.");
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.2
      })
    });

    const json = (await response.json().catch(() => ({}))) as DeepSeekResponse;
    if (!response.ok) {
      throw new Error(`DeepSeek ${label} request failed (${response.status}): ${json.error?.message ?? response.statusText}`);
    }
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`DeepSeek ${label} response did not contain message content.`);
    }
    return {
      content,
      usage: {
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
        totalTokens: json.usage?.total_tokens
      }
    };
  }
}

function systemMessage(): { role: "system"; content: string } {
  return {
    role: "system",
    content: [
      "You are DeepSeek Harness Lab's planning and patching engine.",
      "You help a local agent modify the user's own git repository.",
      "Respect the harness safety policy: no credential output, no destructive commands, no system directory writes, no network downloads.",
      "Prefer minimal diffs and explicit validation."
    ].join(" ")
  };
}
