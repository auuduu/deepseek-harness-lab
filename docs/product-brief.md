# Product Brief: DeepSeek Harness Lab

## Positioning

DeepSeek Harness Lab is a local agent harness for heavy AI developers who want autonomous coding help but still need repo-level context, bounded execution, reviewable traces, and rollback.

## Target Users

- AI-heavy product builders evaluating agentic coding workflows.
- Internal developer tool teams building Coding Agent / Harness capabilities.
- Developer Relations and technical content teams creating reliable demos from real repos.
- Researchers or PMs who need to explain not only the final code change, but why an agent made it and how it recovered from failures.

## Job To Be Done

When I give an agent a real repo and a task, I want it to understand enough context, make a bounded change, run validation, and leave behind a trace I can review or show to others, so I can trust the outcome without manually reconstructing the process from chat logs.

## Competitive Frame

Claude Code:
Strong terminal-native coding flow and tool use. Harness Lab's differentiator is productizing the trace and case-study export as a first-class review artifact.

Codex:
Strong repository editing and task execution experience. Harness Lab focuses on a lightweight local dashboard and explicit safety policy for interview/demo storytelling.

Cursor:
Strong IDE context and inline editing. Harness Lab is not an IDE; it is a reproducible execution wrapper around repo scans, patches, commands, and reports.

Cline:
Strong open agent loop in VS Code. Harness Lab intentionally avoids IDE integration in V1 to keep scope on CLI reproducibility and product-facing trace quality.

## V1 Scope

- CLI run command.
- Repo scanner and context pack.
- DeepSeek provider with structured JSON plan and patch generation.
- Deterministic mock provider for offline demos and tests.
- Auto executor with up to 3 iterations.
- Command allowlist and denylist.
- Run artifact store.
- React dashboard for timeline, plan, diff, commands, metrics, and report.
- Case-study exporter.

## Non-Goals

- IDE extension.
- Multi-user collaboration.
- Arbitrary shell agent.
- Unreviewed push/merge to remote branches.
- Running package installs or arbitrary network downloads.

## Core Metrics

- Task completion rate on prepared repo tasks.
- Patch application success rate.
- Validation pass rate after 1, 2, and 3 iterations.
- Time from command start to reviewable report.
- Trace completeness: plan, diff, command output, failure reason, rollback.
- Safety denials caught before execution.

## Failure Taxonomy

- Context missing: scanner did not include the right file or config.
- Patch conflict: generated diff did not apply.
- Command rejected: model proposed an unsafe or unsupported command.
- Test failure: code changed but validation still failed.
- Goal mismatch: patch applies and tests pass, but user intent is not satisfied.
- Provider failure: API key missing, invalid JSON, timeout, or model error.

## Roadmap

V1:
Local CLI + dashboard, branch guardrails, DeepSeek planner, patch executor, tests, and case-study export.

V2:
Better context ranking, semantic file summaries, command result classification, richer cost/token estimation, dashboard-triggered reruns, and PR description generation.

V3:
IDE plugin, benchmark suite, multi-agent reviewer, organization policy profiles, and remote CI integration.
