# 3-Minute Demo Script

## 0:00-0:30 Setup

"This is DeepSeek Harness Lab. It is a local CLI and dashboard for autonomous coding runs. The goal is not just to edit code, but to make the agent run auditable: repo context, structured plan, patch, command output, final diff, and rollback."

## 0:30-1:20 CLI Run

Show:

```bash
npm run harness -- run \
  --repo /path/to/deploy-homepage \
  --task "Add a DeepSeek Harness Lab project card with links to the GitHub repo and homepage case study" \
  --test "test -f index.html" \
  --mode auto
```

Explain:

- The target repo must be clean.
- Harness creates `harness-lab/<runId>`.
- DeepSeek is the default provider; mock provider is available for offline demos.
- Unsafe shell commands are rejected before execution.

## 1:20-2:20 Dashboard

Open `http://localhost:5173`.

Show:

- Run list and status.
- Repo context: branch, files indexed, rollback.
- Trace timeline: preflight, scan, plan, patch, validation, evaluation.
- Diff tab: exact `index.html` project-card patch.
- Report tab: exported case study.

## 2:20-3:00 Product Framing

"The product insight is that agent coding needs a harness layer. For heavy AI developers, the core value is not only the patch. It is knowing what context the agent saw, what commands it ran, where it failed, and how to roll back. This is why the MVP is CLI plus dashboard instead of another chat UI."

Close with roadmap:

- Better context ranking.
- Failure classification.
- PR summary generation.
- IDE plugin only after the harness loop is reliable.
