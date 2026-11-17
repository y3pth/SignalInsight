# SignalInsight 前后端分离 · 异步协作指南

> 适用：两人异步协作。**后端**（数值/逻辑，Qoder 会话 A）+ **前端**（UI 设计，会话 B/开发者）。
> 接口规范见 `CONTRACT.md`（契约 v1.0）。项目状态见 `HANDOFF.md`。前端上手见 `FRONTEND.md`。
> 核心原则：**稳定契约 + 文件所有权 + 后端加法式演进 + git/文档为唯一事实来源**。

---

## 1. 角色与事实来源

- 后端负责：数值内核、解析、Worker、Edge Function、分析/AI/导出/历史**逻辑**、契约与逻辑测试。
- 前端负责：页面结构、视觉、图表、交互、UI 状态、渲染。
- 跨会话/跨机器**记忆不共享**：`git` + `CONTRACT.md` + `HANDOFF.md` 是唯一事实来源。任何口头约定必须落文档。
- 不直接改 `main`；不强推、不重写历史、不删未知工作。

## 2. 文件所有权（冲突预防的核心）

| 区域 | 文件 | 所有者 |
|---|---|---|
| 数值内核 | `site/dist/dsp.js` | 后端 |
| 解析 | `site/dist/csv.js`、`mat.js` | 后端 |
| Worker | `site/dist/analyzer-worker.js` | 后端 |
| 逻辑服务（拆分后） | `site/dist/service.js` | 后端 |
| Edge Function | `site/functions/*` | 后端 |
| 逻辑测试 | `site/test/{dsp,csv,extreme,mat,iq,function,fixtures,ai-consistency,static,contract}.test.mjs` | 后端 |
| 页面结构 | `site/dist/index.html` | 前端 |
| 视觉 | `site/dist/styles.css` | 前端 |
| UI 控制器/渲染 | `site/dist/app.js`（拆分后） | 前端 |
| E2E/视觉回归 | `site/test/e2e.mjs` | 前端（后端协助） |
| 契约 | `CONTRACT.md` | 后端维护，前端遵守 |
| 状态/交接 | `HANDOFF.md`、`README.md`、`TRANSFER.md` | 双方按节更新 |

规则：**不编辑对方所有的文件**。确需跨界 → 先在协作日志提案，对方确认后再动。

## 3. 分支与同步模型

- 共享集成分支：`integration`（从当前 `feat/trust-lab` 创建）。所有成果最终汇入它。
- 后端任务分支：`backend/<任务>`；前端任务分支：`frontend/<任务>`。均从 `integration` 分出。
- 同步节奏（异步关键）：
  1. 每次开工：`git checkout integration && git pull --ff-only`（若配置远端），再 `git checkout <自己的分支> && git merge integration` 把对方最新成果并入自己分支。
  2. 频繁小步合并 integration → 自己分支，避免长期分叉。
  3. 完工且质检通过：`git checkout integration && git merge --no-ff <自己的分支>`，更新 HANDOFF 协作日志。
- 合并顺序协调：同一时间只一人向 integration 合并；合并前在协作日志声明「正在合并」，完成后写结果。无远端时以本机为准，另一机通过 git 同步。
- 发布：仅由指定发布机走桌面 Sites MCP，需用户确认；action 不复用。

## 4. 契约优先工作流

1. 后端冻结 `CONTRACT.md` v1.0，并提供样例结果 `site/test/fixtures/sample-result.json`。
2. 前端**基于契约 + 样例 fixture** 独立开发 UI，无需后端实时运行（可直接 import 稳定的后端模块取真实数据，或用样例 JSON 调样式）。
3. 后端拓展功能时**只加可选字段/新函数**，保持既有契约不变 → 前端不破坏。
4. 必须破坏契约时：后端升契约版本 + changelog + 协作日志通知 + 前端确认 → 双方适配 → 更新 contract.test。
5. 前端忽略未知字段；不假设后端内部实现。

## 5. 每次会话异步清单

开工：
```bash
git status --short --branch
git checkout integration && git pull --ff-only   # 有远端时
git checkout <自己的分支> && git merge integration
```
- 读 `CONTRACT.md`（契约版本）、`HANDOFF.md`（协作日志/阻塞）、本指南所有权表。
- 确认本次任务只触碰自己所有的文件。

工作：
- 后端：改逻辑 → 跑 `dsp/function/ai-consistency/static/contract` 等相关测试。
- 前端：改 UI → 跑 `e2e.mjs` + 浏览器目视；用样例 fixture 校验渲染。

收尾：
- 跑**全套**测试（后端 9 项 + 前端 E2E）确保互不破坏。
- 提交（仓库历史作者，环境变量身份，不改全局配置）。
- 合并 integration → 自己分支已无冲突；质检绿 → 合并入 integration。
- 在 `HANDOFF.md` 协作日志写：日期/角色/分支/契约版本/改动/阻塞/下一步。

## 6. 版本协调（避免 ?v= 冲突）

- 缓存标签 `?v=N` 跨 `index.html`（前端）与 `app.js/service.js/worker`（后端）。
- 约定：**并行开发期间双方都不改 ?v=**；集成入 integration 后，由**后端**在一个提交里统一递增全部标签并跑 `static.test.mjs`（强制单一版本）。
- 前端改 `index.html` 结构时保留 script/link 的 `?v=` 原值；后端集成时统一替换。
- 契约版本（CONTRACT.md）与缓存 ?v= 是两套独立编号，互不替代。

## 7. 测试边界

- 后端门禁：`dsp csv extreme mat iq function fixtures ai-consistency static contract`。
- 前端门禁：`e2e.mjs`（真实浏览器全功能）+ 目视/响应式。
- 合并入 integration 前**双方门禁都要绿**。`contract.test.mjs` 锁结果形状，防后端无意破坏契约。
- 改动 Worker/DSP/Function 后按 AGENTS.md 跑对应测试。

## 8. 前端独立开发支持

- 样例数据：`site/test/fixtures/sample-result.json`（单频真实分析结果）、`sample-unknown.json`（噪声 unknown）、各 CSV fixture。
- 前端可：用样例 JSON 直接调渲染/样式；或 import 后端 `service.js`/`dsp.js` 跑真实分析（后端稳定、DOM-free）。
- 本地预览：`python -m http.server 4173 --bind 127.0.0.1 --directory site/dist`（无 Function，AI 显示不可达，属预期）。

## 9. 冲突预防与解决

- 预防：所有权表 + 契约冻结 + 加法演进 + 频繁同步 + 集成期统一版本号。
- 若仍冲突：保留双方改动，按契约裁决接口归属；逻辑归后端、渲染归前端；不确定处在协作日志讨论，不擅自丢弃对方工作。
- 禁止用 `--no-verify`/强推/重置绕过问题。

## 10. 协作日志格式（写入 HANDOFF.md）

```
- 2026-11-17 · 后端 · backend/xxx · 契约1.0 · 新增X功能(加法) · 全套绿 · 无阻塞 · 下一步Y
- 2026-11-17 · 前端 · frontend/yyy · 契约1.0 · 重做结论卡视觉 · E2E绿 · 阻塞:需后端加Z字段(已提案)
```

## 11. 拆分实施记录（后端，已完成）

`app.js` 的纯逻辑已抽到 `service.js`（后端，DOM-free），`app.js` 留 DOM/渲染/事件（前端）。

- `service.js`（后端）：Worker 编排 `analyzeSignalSafely/analyzeIqSafely/stressTestSafely`、`fetchAiHealth`、`fetchExplanation` + `AI_ERROR_MESSAGES`、`buildReport`、历史存储 `getHistory/addHistory/clearHistoryStorage`。
- `app.js`（前端）：`elements/state`、`render*`、图表、`bindEvents/init`、`showToast`、下载触发、历史渲染、AI 缓存与竞态守卫。
- `service.js` 严格不访问 DOM；`app.js` import service.js 调用。
- `contract.test.mjs` 锁结果/载荷/报告形状；样例 fixture 供前端独立开发。
- 拆分后全套测试 + E2E 全绿，零行为变化；契约 v1.0 形状不变（仅内部重组）；模块版本 v=9。

> 前端可全权改 `app.js` 渲染层与 `index.html/styles.css`；后端逻辑改动只在 `service.js`/`dsp.js`/`functions/*` 等。双方按所有权表并行，集成时由后端统一递增 `?v=`。