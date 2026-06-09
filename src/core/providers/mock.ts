import type {
  HarnessPlan,
  HarnessProvider,
  PatchInput,
  PlanInput,
  SummaryInput
} from "../../types/harness.js";

export class MockProvider implements HarnessProvider {
  readonly model = "mock-deterministic";

  async createPlan(input: PlanInput): Promise<{ plan: HarnessPlan }> {
    const candidatePaths = input.repoSummary.candidateFiles.map((file) => file.path);
    const isCalculator = candidatePaths.some((file) => file.includes("calculator"));
    const isHomepage = candidatePaths.some((file) => file === "index.html");
    return {
      plan: {
        objective: input.task,
        observations: [
          "Using deterministic mock provider for offline validation.",
          isCalculator
            ? "Fixture calculator implementation and tests are present."
            : "Repo context was scanned and high-signal files were selected.",
          isHomepage ? "Static homepage entry point is available for a project-link edit." : "No homepage-specific edit detected."
        ],
        filesToInspect: candidatePaths.slice(0, 6),
        commands: input.testCommand ? [input.testCommand] : [],
        edits: isCalculator
          ? [{ path: "src/calculator.js", intent: "Fix add() implementation to satisfy tests." }]
          : isHomepage
            ? [{ path: "index.html", intent: "Add DeepSeek Harness Lab project entry/link." }]
            : [{ path: "docs/harness-lab-note.md", intent: "Add a traceable mock-provider note." }],
        acceptance: [
          "Patch applies cleanly.",
          input.testCommand ? `Validation command passes: ${input.testCommand}` : "Final diff is produced."
        ],
        risks: ["Mock provider is deterministic and does not exercise DeepSeek API behavior."]
      }
    };
  }

  async createPatch(input: PatchInput): Promise<{ patch: string }> {
    const calculator = input.repoSummary.candidateFiles.find((file) => file.path === "src/calculator.js");
    if (calculator?.excerpt?.includes("return a - b;")) {
      const after = calculator.excerpt.replace("return a - b;", "return a + b;");
      return { patch: fullFilePatch("src/calculator.js", calculator.excerpt, after) };
    }

    const homepage = input.repoSummary.candidateFiles.find((file) => file.path === "index.html");
    if (homepage?.excerpt && input.task.toLowerCase().includes("harness")) {
      const after = addHomepageProjectLink(homepage.excerpt);
      if (after !== homepage.excerpt) {
        return { patch: fullFilePatch("index.html", homepage.excerpt, after) };
      }
    }

    return {
      patch: newFilePatch(
        "docs/harness-lab-note.md",
        [
          "# DeepSeek Harness Lab Mock Run",
          "",
          `Task: ${input.task}`,
          "",
          "This file was created by the deterministic mock provider so the CLI, trace store, dashboard, and reporter can be validated without DEEPSEEK_API_KEY.",
          ""
        ].join("\n")
      )
    };
  }

  async summarize(input: SummaryInput): Promise<{ summary: string }> {
    const failingStep = input.run.steps.find((step) => step.status === "failed");
    const validation = failingStep
      ? `Validation failed at step "${failingStep.title}": ${failingStep.error ?? "unknown error"}`
      : "Validation completed successfully.";
    return {
      summary: [
        `Mock Harness run ${input.run.runId} completed for task: ${input.run.task}`,
        validation,
        input.run.finalDiff ? "A final git diff was captured for review." : "No final diff was captured.",
        `Rollback: ${input.run.rollbackHint ?? "switch back to the original branch and delete the harness branch."}`
      ].join("\n")
    };
  }
}

function addHomepageProjectLink(html: string): string {
  if (html.includes("DeepSeek Harness Lab")) return html;
  const projectCard = [
    '          <article class="card case-card" id="deepseek-harness-lab">',
    "            <h3>DeepSeek Harness Lab：真实 repo 的自动改码与审计追踪</h3>",
    "            <div class=\"case-meta\">",
    "              <span class=\"pill\">Agent Harness</span>",
    "              <span class=\"pill\">CLI + Dashboard</span>",
    "              <span class=\"pill\">Trace</span>",
    "            </div>",
    "            <ul>",
    '              <li>面向 DeepSeek Harness 产品经理/开发者岗位，做本地 CLI + Web Dashboard，展示 repo 扫描、规划、patch、检查、复盘报告。</li>',
    '              <li><a href="https://github.com/auuduu/deepseek-harness-lab">GitHub 仓库</a> · <a href="https://github.com/auuduu/deepseek-harness-lab/blob/main/docs/case-study-homepage.md">主页 case study</a></li>',
    "              <li>适配：Harness 产品、Agent 开发者体验、Developer Relations demo 叙事。</li>",
    "            </ul>",
    "          </article>"
  ].join("\n");

  const caseGridEnd = "        </div>\n      </section>\n\n      <div class=\"quote-band\">";
  if (html.includes(caseGridEnd)) {
    return html.replace(caseGridEnd, `${projectCard}\n        </div>\n      </section>\n\n      <div class="quote-band">`);
  }
  if (html.includes("</main>")) {
    return html.replace("</main>", `${projectCard}\n  </main>`);
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", `${projectCard}\n</body>`);
  }
  return `${html.trimEnd()}\n${projectCard}\n`;
}

function fullFilePatch(filePath: string, before: string, after: string): string {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`)
  ].join("\n") + "\n";
}

function newFilePatch(filePath: string, content: string): string {
  const lines = splitLines(content);
  return [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`)
  ].join("\n") + "\n";
}

function splitLines(value: string): string[] {
  const normalized = value.endsWith("\n") ? value.slice(0, -1) : value;
  return normalized.split("\n");
}
