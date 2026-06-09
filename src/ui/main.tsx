import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HarnessRun, HarnessStep } from "../types/harness.js";
import "./styles.css";

type ReviewTab = "diff" | "commands" | "report";

function App() {
  const [runs, setRuns] = useState<HarnessRun[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedRun, setSelectedRun] = useState<HarnessRun | null>(null);
  const [reviewTab, setReviewTab] = useState<ReviewTab | null>(null);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");

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

  const realRuns = runs.filter(isRealProviderRun);
  const mockRuns = runs.filter((run) => !isRealProviderRun(run));
  const stats = useMemo(() => summarizeRuns(runs), [runs]);

  return (
    <div className={`codex-shell ${reviewTab ? "review-open" : ""}`}>
      <aside className="side">
        <header className="side-brand">
          <div className="dot-logo">H</div>
          <div>
            <h1>Harness</h1>
            <p>可审计 Agent Lab</p>
          </div>
          <button onClick={() => void refreshRuns()}>刷新</button>
        </header>

        <div className="mini-stats">
          <span>{stats.real} 真实 API</span>
          <span>{stats.completed} 完成</span>
          <span>{stats.skipped} 跳过</span>
        </div>

        <RunSection title="真实 API" runs={realRuns} selectedId={selectedId} onSelect={setSelectedId} />
        <RunSection title="离线演示" runs={mockRuns} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>

      <main className="chat">
        {error ? <div className="error-line">{error}</div> : null}
        {selectedRun ? (
          <>
            <ChatTop run={selectedRun} onOpenReview={setReviewTab} />
            <Conversation run={selectedRun} />
            <BottomReview run={selectedRun} onOpenReview={setReviewTab} />
          </>
        ) : (
          <div className="empty-chat">左侧选择一个 run。</div>
        )}
      </main>

      {selectedRun && reviewTab ? (
        <ReviewDrawer run={selectedRun} tab={reviewTab} setTab={setReviewTab} report={report} onClose={() => setReviewTab(null)} />
      ) : null}
    </div>
  );
}

function ChatTop({ run, onOpenReview }: { run: HarnessRun; onOpenReview: (tab: ReviewTab) => void }) {
  return (
    <header className="chat-top">
      <div>
        <div className="crumb">
          <span>{isRealProviderRun(run) ? "DeepSeek 真实 API" : "Mock run"}</span>
          <span>{run.metrics.model ?? "unknown"}</span>
          <span>{statusText(run.status)}</span>
        </div>
        <h2>{runTitle(run)}</h2>
      </div>
      <nav className="top-actions">
        <button onClick={() => onOpenReview("diff")}>Diff</button>
        <button onClick={() => onOpenReview("commands")}>命令</button>
        <button onClick={() => onOpenReview("report")}>报告</button>
      </nav>
    </header>
  );
}

function Conversation({ run }: { run: HarnessRun }) {
  const skipped = run.steps.filter((step) => step.status === "skipped");
  return (
    <section className="conversation">
      <Bubble role="user" label="你">
        <p>{run.task}</p>
      </Bubble>

      <Bubble role="assistant" label="HL">
        <p>
          我已在 <code>{run.branchName ?? "未创建分支"}</code> 上执行。目标仓库：
          <code>{shortPath(run.repoPath)}</code>。
        </p>
        <p>
          验证：<code>{run.testCommand ?? "未配置"}</code>
          {run.metrics.totalTokens ? ` · ${run.metrics.totalTokens} tokens` : ""}
        </p>
      </Bubble>

      <div className="event-stream">
        {run.steps.map((step) => (
          <EventRow key={step.id} step={step} />
        ))}
      </div>

      {skipped.length ? (
        <Bubble role="assistant" label="HL">
          <p>
            安全策略跳过了 {skipped.length} 条模型建议命令；用户显式 <code>--test</code> 仍继续执行。
          </p>
        </Bubble>
      ) : null}

      <Bubble role="assistant" label="HL">
        <p className="summary-text">{run.finalSummary ?? "暂无最终总结。"}</p>
      </Bubble>
    </section>
  );
}

function EventRow({ step }: { step: HarnessStep }) {
  return (
    <article className={`event-row ${step.status}`}>
      <span className="event-icon">{eventIcon(step)}</span>
      <div className="event-main">
        <div className="event-title">
          <strong>{stepTitle(step)}</strong>
          <span>{stepStatusText(step.status)}</span>
        </div>
        {step.command ? <code>{step.command}</code> : null}
        {step.output ? <p>{firstLine(step.output)}</p> : null}
        {step.error ? <p className="event-error">{firstLine(step.error)}</p> : null}
      </div>
    </article>
  );
}

function BottomReview({ run, onOpenReview }: { run: HarnessRun; onOpenReview: (tab: ReviewTab) => void }) {
  const stat = diffStat(run.finalDiff ?? "");
  return (
    <footer className="bottom-bar">
      <div className="change-line">
        <strong>{stat.files} files changed</strong>
        <span className="add">+{stat.added}</span>
        <span className="del">-{stat.removed}</span>
      </div>
      <button onClick={() => onOpenReview("diff")}>Review</button>
      <div className="goal-line">
        <span>追踪 run</span>
        <strong>{run.runId}</strong>
      </div>
    </footer>
  );
}

function ReviewDrawer({
  run,
  tab,
  setTab,
  report,
  onClose
}: {
  run: HarnessRun;
  tab: ReviewTab;
  setTab: (tab: ReviewTab) => void;
  report: string;
  onClose: () => void;
}) {
  return (
    <aside className="review">
      <header className="review-head">
        <h2>Review</h2>
        <button onClick={onClose}>关闭</button>
      </header>
      <div className="review-tabs">
        <button className={tab === "diff" ? "active" : ""} onClick={() => setTab("diff")}>
          Diff
        </button>
        <button className={tab === "commands" ? "active" : ""} onClick={() => setTab("commands")}>
          命令
        </button>
        <button className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>
          报告
        </button>
      </div>
      <div className="review-body">
        {tab === "diff" ? <CodeBlock value={run.finalDiff || run.patches.at(-1)?.patch || "暂无 diff"} /> : null}
        {tab === "commands" ? <CommandList run={run} /> : null}
        {tab === "report" ? <CodeBlock value={report || "报告未生成"} /> : null}
      </div>
    </aside>
  );
}

function CommandList({ run }: { run: HarnessRun }) {
  const commands = run.steps.filter((step) => step.command);
  return (
    <div className="command-list">
      {commands.map((step) => (
        <article key={step.id} className={`command-block ${step.status}`}>
          <header>
            <span>{stepStatusText(step.status)}</span>
            <code>{step.command}</code>
          </header>
          {step.output ? <pre>{step.output}</pre> : null}
          {step.error ? <pre>{step.error}</pre> : null}
        </article>
      ))}
    </div>
  );
}

function RunSection({
  title,
  runs,
  selectedId,
  onSelect
}: {
  title: string;
  runs: HarnessRun[];
  selectedId: string;
  onSelect: (runId: string) => void;
}) {
  if (!runs.length) return null;
  return (
    <section className="run-section">
      <h2>{title}</h2>
      {runs.map((run) => (
        <button key={run.runId} className={`run-pill ${selectedId === run.runId ? "active" : ""}`} onClick={() => onSelect(run.runId)}>
          <span className={`run-dot ${run.status}`} />
          <span>
            <strong>{runTitle(run)}</strong>
            <small>{formatDate(run.startedAt)} · {statusText(run.status)}</small>
          </span>
        </button>
      ))}
    </section>
  );
}

function Bubble({ role, label, children }: { role: "user" | "assistant"; label: string; children: React.ReactNode }) {
  return (
    <article className={`bubble ${role}`}>
      <div className="avatar">{label}</div>
      <div className="bubble-body">{children}</div>
    </article>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre className="code">
      <code>{value}</code>
    </pre>
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

function stepTitle(step: HarnessStep): string {
  const labels: Record<HarnessStep["type"], string> = {
    preflight: "检查仓库并创建分支",
    scan: "扫描上下文",
    plan: "生成计划",
    patch: "应用补丁",
    command: "运行命令",
    evaluate: "评估结果",
    report: "生成报告"
  };
  return labels[step.type] ?? step.title;
}

function eventIcon(step: HarnessStep): string {
  if (step.status === "skipped") return "!";
  if (step.status === "failed") return "x";
  if (step.type === "command") return "$";
  if (step.type === "patch") return "+";
  return "•";
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

function diffStat(diff: string) {
  const files = new Set<string>();
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) files.add(line);
    if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
    if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
  }
  return { files: files.size, added, removed };
}

function firstLine(value: string): string {
  return value.split("\n").find((line) => line.trim())?.trim().slice(0, 180) ?? "";
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

createRoot(document.getElementById("root")!).render(<App />);
