import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HarnessRun, HarnessStep } from "../types/harness.js";
import "./styles.css";

type InspectorTab = "diff" | "commands" | "report" | "context";

function App() {
  const [runs, setRuns] = useState<HarnessRun[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedRun, setSelectedRun] = useState<HarnessRun | null>(null);
  const [activeTab, setActiveTab] = useState<InspectorTab>("diff");
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void refreshRuns();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void fetchRun(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedRun) return;
    fetch(`/api/runs/${selectedRun.runId}/artifacts/case-study.md`)
      .then((res) => (res.ok ? res.text() : ""))
      .then(setReport)
      .catch(() => setReport(""));
  }, [selectedRun]);

  async function refreshRuns() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/runs");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as HarnessRun[];
      setRuns(data);
      const preferred = data.find(isRealProviderRun)?.runId || data[0]?.runId || "";
      const nextId = selectedId || preferred;
      setSelectedId(nextId);
      if (!nextId) setSelectedRun(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }

  async function fetchRun(runId: string) {
    setError("");
    const res = await fetch(`/api/runs/${runId}`);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setSelectedRun((await res.json()) as HarnessRun);
  }

  const stats = useMemo(() => summarizeRuns(runs), [runs]);
  const realRuns = runs.filter(isRealProviderRun);
  const mockRuns = runs.filter((run) => !isRealProviderRun(run));

  return (
    <div className="workbench">
      <aside className="case-rail">
        <header className="rail-head">
          <div className="product-mark">HL</div>
          <div>
            <h1>Harness Lab</h1>
            <p>DeepSeek / 火山方舟工作台</p>
          </div>
          <button className="ghost-button" onClick={() => void refreshRuns()}>
            刷新
          </button>
        </header>

        <section className="run-meters" aria-label="运行概览">
          <Meter label="真实 API" value={String(stats.real)} tone="blue" />
          <Meter label="完成" value={String(stats.completed)} tone="green" />
          <Meter label="安全拦截" value={String(stats.skipped)} tone="amber" />
        </section>

        {loading ? <div className="rail-empty">正在读取本地 trace...</div> : null}
        {!loading && runs.length === 0 ? <div className="rail-empty">暂无运行记录</div> : null}

        <RunGroup
          title="真实 API 测试案例"
          runs={realRuns}
          selectedId={selectedId}
          onSelect={(run) => {
            setSelectedId(run.runId);
            setActiveTab("diff");
          }}
        />
        <RunGroup
          title="Mock / 离线演示"
          runs={mockRuns}
          selectedId={selectedId}
          onSelect={(run) => {
            setSelectedId(run.runId);
            setActiveTab("diff");
          }}
        />
      </aside>

      <main className="thread-pane">
        {error ? <div className="error-banner">{error}</div> : null}
        {selectedRun ? <RunThread run={selectedRun} /> : <EmptyThread />}
      </main>

      <aside className="inspector">
        {selectedRun ? (
          <Inspector run={selectedRun} activeTab={activeTab} setActiveTab={setActiveTab} report={report} />
        ) : (
          <div className="inspector-empty">选择一个 run</div>
        )}
      </aside>
    </div>
  );
}

function RunThread({ run }: { run: HarnessRun }) {
  const commandSteps = run.steps.filter((step) => step.command);
  const safetySkipped = run.steps.filter((step) => step.status === "skipped").length;
  return (
    <div className="thread">
      <header className="thread-title">
        <div className="thread-kicker">
          <Badge tone={isRealProviderRun(run) ? "blue" : "gray"}>{isRealProviderRun(run) ? "真实 API" : "Mock"}</Badge>
          <Badge tone={run.status === "completed" ? "green" : run.status === "failed" ? "red" : "amber"}>
            {statusText(run.status)}
          </Badge>
          {safetySkipped ? <Badge tone="amber">安全跳过 {safetySkipped}</Badge> : null}
        </div>
        <h2>{run.task}</h2>
        <p>
          {run.runId} · {formatDateTime(run.startedAt)} · {run.metrics.model ?? "unknown model"}
        </p>
      </header>

      <Message role="user" title="用户任务">
        <p>{run.task}</p>
      </Message>

      <Message role="assistant" title="Harness 执行概览">
        <div className="summary-grid">
          <Fact label="目标仓库" value={shortPath(run.repoPath)} />
          <Fact label="执行分支" value={run.branchName ?? "未创建"} />
          <Fact label="验证命令" value={run.testCommand ?? "未配置"} />
          <Fact label="Token" value={run.metrics.totalTokens ? String(run.metrics.totalTokens) : "无记录"} />
        </div>
        {run.finalSummary ? <p className="final-summary">{run.finalSummary}</p> : null}
      </Message>

      <section className="step-stream" aria-label="执行时间线">
        {run.steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </section>

      {commandSteps.length ? (
        <Message role="assistant" title="命令结果">
          <div className="command-strip">
            {commandSteps.map((step) => (
              <span key={step.id} className={`command-chip ${step.status}`}>
                {step.command}
              </span>
            ))}
          </div>
        </Message>
      ) : null}
    </div>
  );
}

function Inspector({
  run,
  activeTab,
  setActiveTab,
  report
}: {
  run: HarnessRun;
  activeTab: InspectorTab;
  setActiveTab: (tab: InspectorTab) => void;
  report: string;
}) {
  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: "diff", label: "Diff" },
    { id: "commands", label: "命令" },
    { id: "report", label: "报告" },
    { id: "context", label: "上下文" }
  ];
  return (
    <>
      <header className="inspector-head">
        <h2>检查器</h2>
        <div className="artifact-links">
          <a href={`/api/runs/${run.runId}/artifacts/run.json`} target="_blank" rel="noreferrer">
            JSON
          </a>
          <a href={`/api/runs/${run.runId}/artifacts/case-study.md`} target="_blank" rel="noreferrer">
            Case
          </a>
        </div>
      </header>
      <div className="segmented" role="tablist" aria-label="检查器视图">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {activeTab === "diff" ? <CodeBlock language="diff" value={run.finalDiff || run.patches.at(-1)?.patch || ""} /> : null}
        {activeTab === "commands" ? <CommandPanel run={run} /> : null}
        {activeTab === "report" ? <CodeBlock language="markdown" value={report || "报告未生成"} /> : null}
        {activeTab === "context" ? <ContextPanel run={run} /> : null}
      </div>
    </>
  );
}

function RunGroup({
  title,
  runs,
  selectedId,
  onSelect
}: {
  title: string;
  runs: HarnessRun[];
  selectedId: string;
  onSelect: (run: HarnessRun) => void;
}) {
  if (runs.length === 0) return null;
  return (
    <section className="run-group">
      <h2>{title}</h2>
      <div className="run-list">
        {runs.map((run) => (
          <button
            key={run.runId}
            className={`run-card ${selectedId === run.runId ? "selected" : ""}`}
            onClick={() => onSelect(run)}
          >
            <span className={`status-line ${run.status}`} />
            <span className="run-card-body">
              <span className="run-card-meta">
                <Badge tone={isRealProviderRun(run) ? "blue" : "gray"}>{isRealProviderRun(run) ? "真实" : "Mock"}</Badge>
                <span>{formatDate(run.startedAt)}</span>
              </span>
              <strong>{runTitle(run)}</strong>
              <span>{run.metrics.model ?? "unknown"} · {statusText(run.status)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function StepCard({ step }: { step: HarnessStep }) {
  return (
    <article className={`step-card ${step.status}`}>
      <div className="step-marker">
        <span />
      </div>
      <div className="step-content">
        <div className="step-head">
          <div>
            <span className="step-type">{stepTypeText(step.type)}</span>
            <h3>{step.title}</h3>
          </div>
          <Badge tone={stepTone(step.status)}>{stepStatusText(step.status)}</Badge>
        </div>
        {step.command ? <code>{step.command}</code> : null}
        {step.output ? <pre>{step.output}</pre> : null}
        {step.error ? <pre className="error-text">{step.error}</pre> : null}
      </div>
    </article>
  );
}

function CommandPanel({ run }: { run: HarnessRun }) {
  const commands = run.steps.filter((step) => step.command);
  if (commands.length === 0) return <div className="muted-box">没有命令记录</div>;
  return (
    <div className="command-panel">
      {commands.map((step) => (
        <article key={step.id} className={`command-item ${step.status}`}>
          <div className="command-item-head">
            <Badge tone={stepTone(step.status)}>{stepStatusText(step.status)}</Badge>
            <code>{step.command}</code>
          </div>
          {step.output ? <pre>{step.output}</pre> : null}
          {step.error ? <pre className="error-text">{step.error}</pre> : null}
        </article>
      ))}
    </div>
  );
}

function ContextPanel({ run }: { run: HarnessRun }) {
  const summary = run.repoSummary;
  return (
    <div className="context-panel">
      <div className="summary-grid single">
        <Fact label="仓库" value={run.repoPath} />
        <Fact label="分支" value={run.branchName ?? "未创建"} />
        <Fact label="回滚" value={run.rollbackHint ?? "无"} />
        <Fact label="文件数" value={String(summary?.files.length ?? 0)} />
      </div>
      <h3>候选文件</h3>
      <div className="file-list">
        {(summary?.candidateFiles ?? []).map((file) => (
          <article key={file.path} className="file-row">
            <strong>{file.path}</strong>
            <span>{file.reason}</span>
          </article>
        ))}
      </div>
    </div>
  );
}

function Message({ role, title, children }: { role: "user" | "assistant"; title: string; children: React.ReactNode }) {
  return (
    <section className={`message ${role}`}>
      <div className="avatar">{role === "user" ? "你" : "HL"}</div>
      <div className="message-body">
        <h3>{title}</h3>
        {children}
      </div>
    </section>
  );
}

function Meter({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "amber" }) {
  return (
    <div className={`meter ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Badge({ tone, children }: { tone: "blue" | "green" | "amber" | "red" | "gray"; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  return (
    <pre className="code-block">
      <code data-language={language}>{value || "暂无内容"}</code>
    </pre>
  );
}

function EmptyThread() {
  return (
    <div className="empty-thread">
      <h2>没有选中的 run</h2>
      <p>左侧选择一个真实 API 或 mock 案例。</p>
    </div>
  );
}

function summarizeRuns(runs: HarnessRun[]) {
  return {
    real: runs.filter(isRealProviderRun).length,
    completed: runs.filter((run) => run.status === "completed").length,
    skipped: runs.reduce((sum, run) => sum + run.steps.filter((step) => step.status === "skipped").length, 0)
  };
}

function isRealProviderRun(run: HarnessRun): boolean {
  return Boolean(run.metrics.model && run.metrics.model !== "mock-deterministic");
}

function runTitle(run: HarnessRun): string {
  if (run.task.includes("README.md")) return "中文 README 真实 API";
  if (run.task.toLowerCase().includes("calculator")) return "Calculator 修复";
  if (run.task.toLowerCase().includes("homepage") || run.task.includes("主页")) return "主页项目卡片";
  return run.task;
}

function statusText(status: HarnessRun["status"]): string {
  return {
    created: "已创建",
    planning: "规划中",
    executing: "执行中",
    evaluating: "评估中",
    completed: "完成",
    failed: "失败"
  }[status];
}

function stepStatusText(status: HarnessStep["status"]): string {
  return {
    pending: "等待",
    running: "运行中",
    completed: "完成",
    failed: "失败",
    skipped: "已跳过"
  }[status];
}

function stepTypeText(type: HarnessStep["type"]): string {
  return {
    preflight: "预检",
    scan: "扫描",
    plan: "规划",
    patch: "补丁",
    command: "命令",
    evaluate: "评估",
    report: "报告"
  }[type];
}

function stepTone(status: HarnessStep["status"]): "blue" | "green" | "amber" | "red" | "gray" {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  if (status === "skipped") return "amber";
  if (status === "running") return "blue";
  return "gray";
}

function shortPath(value: string): string {
  const parts = value.split("/");
  if (parts.length <= 4) return value;
  return `.../${parts.slice(-3).join("/")}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

createRoot(document.getElementById("root")!).render(<App />);
