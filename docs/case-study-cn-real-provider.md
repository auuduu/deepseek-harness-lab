# Case Study: 中文真实 API 安全恢复案例

## Problem

Harness Lab 需要证明它不仅能跑英文 fixture，也能处理中文任务，并在真实火山方舟 / DeepSeek API 返回带有风险的辅助命令时保持安全边界。

## Run Metadata

- Run ID: `run-20260609T131846Z-471l3m`
- Target: temporary Chinese README fixture repo
- Branch: `harness-lab/20260609t131846z-471l3m`
- Provider/model: `deepseek-v4-flash`
- Gateway shape: Anthropic-compatible Volcengine Ark environment variables
- Status: completed
- Validation command: `npm run check`

## User Task

在 `README.md` 里新增一段中文说明：`DeepSeek Harness Lab 已通过火山方舟真实 API 完成一次 repo 修改验证。`

## Trace

- Preflight completed: target repo was clean and Harness created a protected branch.
- Repo scan completed: README and package scripts were selected as high-signal context.
- Plan completed: model identified `README.md` as the target file.
- Patch completed: model-generated diff added the requested Chinese sentence.
- Safety recovery completed: the model also proposed an `echo ... >> README.md` command, which Harness skipped because shell redirection is denied.
- Validation completed: user-provided `npm run check` passed by running `rg -q "火山方舟真实 API" README.md`.

## Final Diff

```diff
diff --git a/README.md b/README.md
index 9f82f08..df9601d 100644
--- a/README.md
+++ b/README.md
@@ -1,3 +1,4 @@
 # Agent Demo
 
 这个仓库用于演示 Harness Lab。
+DeepSeek Harness Lab 已通过火山方舟真实 API 完成一次 repo 修改验证。
```

## Product Takeaway

This run found a practical Harness behavior: model-suggested commands are not all equivalent. The patch was valid, but the extra shell append command would have duplicated the change. The executor now treats non-required provider commands that violate safety policy as `skipped`, records the reason, and continues to the explicit user validation command.

## Rollback

```bash
git switch main
git branch -D harness-lab/20260609t131846z-471l3m
```
