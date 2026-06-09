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
const DEFAULT_OPENAI_BASE_URL = "https://api.deepseek.com";
type ProviderProtocol = "openai" | "anthropic";

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

interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: { message?: string };
}

export class DeepSeekProvider implements HarnessProvider {
  readonly model: string;
  private readonly baseUrl: string;
  private readonly protocol: ProviderProtocol;

  constructor(
    model = process.env.DEEPSEEK_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    baseUrl = process.env.DEEPSEEK_BASE_URL ||
      process.env.ARK_BASE_URL ||
      process.env.ANTHROPIC_BASE_URL ||
      DEFAULT_OPENAI_BASE_URL,
    protocol = inferProtocol(baseUrl)
  ) {
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.protocol = protocol;
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
    return { plan: PlanSchema.parse(normalizePlan(parseJsonObject(response.content, "DeepSeek plan"), input.task)), usage: response.usage };
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
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.ARK_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
    if (!apiKey) {
      throw new Error(
        "A provider key is required for provider=deepseek. Set DEEPSEEK_API_KEY, ARK_API_KEY, or ANTHROPIC_AUTH_TOKEN; use provider=mock for offline demos."
      );
    }

    if (this.protocol === "anthropic") {
      return this.anthropicMessages(messages, label, apiKey);
    }

    const response = await fetch(openAiChatUrl(this.baseUrl), {
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

  private async anthropicMessages(
    messages: Array<{ role: "system" | "user"; content: string }>,
    label: string,
    apiKey: string
  ): Promise<{ content: string; usage?: ModelUsage }> {
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const userMessages = messages
      .filter((message) => message.role === "user")
      .map((message) => ({ role: "user", content: message.content }));

    const response = await fetch(anthropicMessagesUrl(this.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: this.model,
        system,
        messages: userMessages,
        max_tokens: 4096,
        temperature: 0.2
      })
    });

    const json = (await response.json().catch(() => ({}))) as AnthropicResponse;
    if (!response.ok) {
      throw new Error(
        `Anthropic-compatible ${label} request failed (${response.status}): ${json.error?.message ?? response.statusText}`
      );
    }
    const content = json.content?.find((item) => item.type === "text" || item.text)?.text;
    if (!content) {
      throw new Error(`Anthropic-compatible ${label} response did not contain text content.`);
    }
    return {
      content,
      usage: {
        promptTokens: json.usage?.input_tokens,
        completionTokens: json.usage?.output_tokens,
        totalTokens:
          json.usage?.input_tokens !== undefined || json.usage?.output_tokens !== undefined
            ? (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0)
            : undefined
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

function normalizePlan(raw: unknown, fallbackObjective: string): HarnessPlan {
  const object = isRecord(raw) ? raw : {};
  return {
    objective: toStringValue(object.objective) || fallbackObjective,
    observations: toStringArray(object.observations ?? object.analysis ?? object.context),
    filesToInspect: toStringArray(object.filesToInspect ?? object.files_to_inspect ?? object.files ?? object.filePaths),
    commands: toStringArray(object.commands ?? object.validationCommands ?? object.validation_commands),
    edits: toEdits(object.edits ?? object.changes ?? object.modifications),
    acceptance: toStringArray(object.acceptance ?? object.acceptanceCriteria ?? object.acceptance_criteria),
    risks: toStringArray(object.risks ?? object.risk)
  };
}

function toEdits(value: unknown): Array<{ path: string; intent: string }> {
  if (!Array.isArray(value)) {
    return toStringArray(value).map((item) => ({ path: "unknown", intent: item }));
  }
  return value
    .map((item) => {
      if (typeof item === "string") return { path: "unknown", intent: item };
      if (!isRecord(item)) return undefined;
      const pathValue = toStringValue(item.path ?? item.file ?? item.filePath ?? item.filename);
      const intent = toStringValue(item.intent ?? item.description ?? item.change ?? item.action ?? item.reason);
      return {
        path: pathValue || "unknown",
        intent: intent || "Modify file according to task."
      };
    })
    .filter((item): item is { path: string; intent: string } => Boolean(item));
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => toStringArray(item))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|;|, (?=[A-Za-z0-9_\u4e00-\u9fff])/)
      .map((item) => item.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([key, item]) => `${key}: ${toStringValue(item)}`.trim());
  }
  return [];
}

function toStringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inferProtocol(baseUrl: string): ProviderProtocol {
  if (process.env.DEEPSEEK_PROTOCOL === "anthropic" || process.env.DEEPSEEK_PROTOCOL === "openai") {
    return process.env.DEEPSEEK_PROTOCOL;
  }
  if (process.env.ANTHROPIC_BASE_URL && !process.env.DEEPSEEK_BASE_URL && !process.env.ARK_BASE_URL) {
    return "anthropic";
  }
  if (/\/api\/(plan|coding|compatible)(\/)?$/i.test(baseUrl) || /\/anthropic(\/)?$/i.test(baseUrl)) {
    return "anthropic";
  }
  return "openai";
}

function openAiChatUrl(baseUrl: string): string {
  if (/\/chat\/completions$/i.test(baseUrl)) return baseUrl;
  return `${baseUrl}/chat/completions`;
}

function anthropicMessagesUrl(baseUrl: string): string {
  if (/\/v1\/messages$/i.test(baseUrl)) return baseUrl;
  return `${baseUrl}/v1/messages`;
}
