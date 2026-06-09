# Case Study: Homepage Project Card

## Problem

For a DeepSeek Harness product/developer interview, a static personal homepage needed a concrete project entry that links to the Harness Lab repo and shows a real agent trace. The task was intentionally small but representative: modify a real repo, keep the change bounded, validate it, and export an audit trail.

## Run Metadata

- Run ID: `run-20260609T111528Z-ifkv6j`
- Target: local `deploy-homepage` git repo
- Branch: `harness-lab/20260609t111528z-ifkv6j`
- Provider/model: `mock-deterministic` for offline validation
- Default real provider: DeepSeek `deepseek-v4-flash`
- Status: completed
- Validation command: `test -f index.html`

## User Task

Add a DeepSeek Harness Lab project card with links to the GitHub repo and homepage case study.

## Trace

- Preflight completed: target repo was clean and Harness created a protected branch.
- Repo scan completed: indexed 4 files and selected 3 candidate files.
- Plan completed: provider selected `index.html` as the edit target.
- Patch completed: one unified diff inserted a new `.case-card` in the existing case grid.
- Validation completed: `test -f index.html` passed.
- Evaluation completed: Harness captured final diff, summary, and rollback hint.

## Final Diff

```diff
diff --git a/index.html b/index.html
index 41b2bd9..03aac6b 100644
--- a/index.html
+++ b/index.html
@@ -700,6 +700,19 @@
               <li>适配：AI 应用产品、科研助理、AI for Science/Robotics 产业研究。</li>
             </ul>
           </article>
+          <article class="card case-card" id="deepseek-harness-lab">
+            <h3>DeepSeek Harness Lab：真实 repo 的自动改码与审计追踪</h3>
+            <div class="case-meta">
+              <span class="pill">Agent Harness</span>
+              <span class="pill">CLI + Dashboard</span>
+              <span class="pill">Trace</span>
+            </div>
+            <ul>
+              <li>面向 DeepSeek Harness 产品经理/开发者岗位，做本地 CLI + Web Dashboard，展示 repo 扫描、规划、patch、检查、复盘报告。</li>
+              <li><a href="https://github.com/auuduu/deepseek-harness-lab">GitHub 仓库</a> · <a href="https://github.com/auuduu/deepseek-harness-lab/blob/main/docs/case-study-homepage.md">主页 case study</a></li>
+              <li>适配：Harness 产品、Agent 开发者体验、Developer Relations demo 叙事。</li>
+            </ul>
+          </article>
         </div>
       </section>
```

## Product Takeaway

The useful product is the harness around the model, not just the model call. The run created a branch, packed repo context, produced a structured plan, applied a patch, ran validation, and generated rollback instructions. That is the part an interviewer can audit.

## Limitation

This public case study uses the deterministic mock provider because no `DEEPSEEK_API_KEY` was available in the local environment. The production path is implemented through DeepSeek's OpenAI-compatible API and can be exercised by setting `DEEPSEEK_API_KEY`.

## Rollback

```bash
git switch main
git branch -D harness-lab/20260609t111528z-ifkv6j
```
