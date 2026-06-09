import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HarnessRun, HarnessStep } from "../types/harness.js";
import "./styles.css";

type Tab = "trace" | "diff" | "plan" | "report";

function App() {
  const [runs, setRuns] = useState<HarnessRun[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedRun, setSelectedRun] = useState<HarnessRun | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("trace");
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
    if (activeTab === "report") {
      fetch(`/api/runs/${selectedRun.runId}/artifacts/case-study.md`)
        .then((res) => (res.ok ? res.text() : ""))
        .then(setReport)
        .catch(() => setReport(""));
    }
  }, [activeTab, selectedRun]);

  async function refreshRuns() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/runs");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as HarnessRun[];
      setRuns(data);
      const nextId = selectedId || data[0]?.runId || "";
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

  const counts = useMemo(() => statusCounts(runs), [runs]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div>
            <h1>DeepSeek Harness Lab</h1>
            <p>Repo-aware autonomous coding trace dashboard</p>
          </div>
          <button className="icon-button" onClick={() => void refreshRuns()} title="Refresh runs" aria-label="Refresh runs">
            R
          </button>
        </div>

        <div className="summary-strip">
          <Metric label="Runs" value={String(runs.length)} />
          <Metric label="Done" value={String(counts.completed ?? 0)} />
          <Metric label="Failed" value={String(counts.failed ?? 0)} />
        </div>

        <div className="run-list" aria-label="Run history">
          {loading ? <div className="empty-state">Loading runs...</div> : null}
          {!loading && runs.length === 0 ? <div className="empty-state">No runs yet. Start with the CLI.</div> : null}
          {runs.map((run) => (
            <button
              key={run.runId}
              className={`run-row ${selectedId === run.runId ? "selected" : ""}`}
              onClick={() => {
                setSelectedId(run.runId);
                setActiveTab("trace");
              }}
            >
              <span className={`status-dot ${run.status}`} />
              <span className="run-row-main">
                <strong>{run.runId}</strong>
                <span>{run.task}</span>
              </span>
              <span className="run-date">{formatDate(run.startedAt)}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main-view">
        {error ? <div className="error-banner">{error}</div> : null}
        {selectedRun ? (
          <>
            <RunHeader run={selectedRun} />
            <section className="top-grid">
              <Panel title="Repo Context">
                <dl className="fact-list">
                  <Fact label="Repo" value={selectedRun.repoPath} />
                  <Fact label="Branch" value={selectedRun.branchName ?? "not created"} />
                  <Fact label="Rollback" value={selectedRun.rollbackHint ?? "not available"} />
                  <Fact label="Files indexed" value={String(selectedRun.repoSummary?.files.length ?? 0)} />
                </dl>
              </Panel>
              <Panel title="Run Metrics">
                <dl className="fact-list compact">
                  <Fact label="Model" value={selectedRun.metrics.model ?? "unknown"} />
                  <Fact label="Iterations" value={String(selectedRun.metrics.iterations)} />
                  <Fact label="Prompt tokens" value={String(selectedRun.metrics.promptTokens ?? "-")} />
                  <Fact label="Completion tokens" value={String(selectedRun.metrics.completionTokens ?? "-")} />
                </dl>
              </Panel>
            </section>

            <div className="tabs" role="tablist" aria-label="Run details">
              {(["trace", "diff", "plan", "report"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  className={activeTab === tab ? "active" : ""}
                  onClick={() => setActiveTab(tab)}
                  role="tab"
                  aria-selected={activeTab === tab}
                >
                  {tabLabel(tab)}
                </button>
              ))}
            </div>

            {activeTab === "trace" ? <Trace steps={selectedRun.steps} /> : null}
            {activeTab === "diff" ? <CodeBlock language="diff" value={selectedRun.finalDiff || selectedRun.patches.at(-1)?.patch || ""} /> : null}
            {activeTab === "plan" ? <Plan run={selectedRun} /> : null}
            {activeTab === "report" ? <CodeBlock language="markdown" value={report || "case-study.md not available yet."} /> : null}
          </>
        ) : (
          <div className="empty-main">
            <h2>No run selected</h2>
            <p>Run the CLI to create a trace, then refresh this dashboard.</p>
            <pre>harness-lab run --repo /path/to/repo --task "..." --test "npm test" --mode auto</pre>
          </div>
        )}
      </main>
    </div>
  );
}

function RunHeader({ run }: { run: HarnessRun }) {
  return (
    <header className="run-header">
      <div>
        <div className={`status-pill ${run.status}`}>{run.status}</div>
        <h2>{run.task}</h2>
        <p>
          {run.runId} · {formatDate(run.startedAt)}
        </p>
      </div>
      <div className="header-actions">
        <a href={`/api/runs/${run.runId}/artifacts/run.json`} target="_blank" rel="noreferrer">
          JSON
        </a>
        <a href={`/api/runs/${run.runId}/artifacts/case-study.md`} target="_blank" rel="noreferrer">
          Case Study
        </a>
      </div>
    </header>
  );
}

function Trace({ steps }: { steps: HarnessStep[] }) {
  return (
    <section className="trace-panel">
      {steps.map((step) => (
        <article key={step.id} className="trace-step">
          <span className={`status-dot ${step.status}`} />
          <div>
            <div className="trace-title">
              <strong>{step.title}</strong>
              <span>{step.type}</span>
            </div>
            {step.command ? <code>{step.command}</code> : null}
            {step.output ? <pre>{step.output}</pre> : null}
            {step.error ? <pre className="error-text">{step.error}</pre> : null}
          </div>
        </article>
      ))}
    </section>
  );
}

function Plan({ run }: { run: HarnessRun }) {
  if (!run.plan) return <CodeBlock language="json" value="No plan available." />;
  return (
    <section className="plan-grid">
      <Panel title="Objective">
        <p>{run.plan.objective}</p>
      </Panel>
      <Panel title="Edits">
        <ul>{run.plan.edits.map((edit) => <li key={`${edit.path}-${edit.intent}`}><strong>{edit.path}</strong>: {edit.intent}</li>)}</ul>
      </Panel>
      <Panel title="Acceptance">
        <ul>{run.plan.acceptance.map((item) => <li key={item}>{item}</li>)}</ul>
      </Panel>
      <Panel title="Risks">
        <ul>{run.plan.risks.map((item) => <li key={item}>{item}</li>)}</ul>
      </Panel>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  return (
    <pre className="code-block">
      <code data-language={language}>{value || "No content."}</code>
    </pre>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function statusCounts(runs: HarnessRun[]): Record<string, number> {
  return runs.reduce<Record<string, number>>((acc, run) => {
    acc[run.status] = (acc[run.status] ?? 0) + 1;
    return acc;
  }, {});
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function tabLabel(tab: Tab): string {
  return {
    trace: "Trace",
    diff: "Diff",
    plan: "Plan",
    report: "Report"
  }[tab];
}

createRoot(document.getElementById("root")!).render(<App />);
