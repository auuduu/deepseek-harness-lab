# Case Study: Real Provider Fixture Run

## Problem

The Harness Lab provider needed to prove it could use the user's existing Volcengine Ark / Claude Code DeepSeek configuration, not only the deterministic mock provider.

## Run Metadata

- Run ID: `run-20260609T112657Z-5bzl2l`
- Target: temporary fixture git repo
- Branch: `harness-lab/20260609t112657z-5bzl2l`
- Provider/model: `deepseek-v4-flash`
- Gateway shape: Anthropic-compatible Volcengine Ark environment variables
- Status: completed
- Iterations: 1
- Total tokens: 4491
- Validation command: `npm test`

## User Task

Fix the calculator add function so tests pass.

## Trace

- Preflight completed: target repo was clean and Harness created a protected branch.
- Repo scan completed: indexed 4 files and selected 4 candidate files.
- Plan completed: DeepSeek identified `src/calculator.js` as the edit target.
- Patch completed: one unified diff changed subtraction to addition.
- Validation completed: `npm test` passed and printed `calculator tests passed`.
- Evaluation completed: DeepSeek generated the final PR-ready summary.

## Final Diff

```diff
diff --git a/src/calculator.js b/src/calculator.js
index 29b3851..7d65831 100644
--- a/src/calculator.js
+++ b/src/calculator.js
@@ -1,3 +1,3 @@
 export function add(a, b) {
-  return a - b;
+  return a + b;
 }
```

## Product Takeaway

The first real-provider run found a schema tolerance issue: the model returned valid JSON with strings and alternate field names where the harness expected strict arrays. The provider now normalizes plan JSON before validation. That is a useful product lesson for Harness design: structured-output contracts need recovery behavior, not only strict parsing.

## Rollback

```bash
git switch main
git branch -D harness-lab/20260609t112657z-5bzl2l
```
