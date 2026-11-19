# 前后端组合测试问题记录

> 日期：2026-11-18 · 记录人：后端
> 方法：将 `integration` 后端（dsp/csv/mat/service/learn/generator/worker，v=15）与前端 `origin/UI`（fea7659，app/index/styles/learn-app/learn.html/learn.css/charts，v=12）组装到临时目录测试。**仅记录，未修改任何项目代码。**

## 一、组合后正常项 ✅
- **分析页**（index.html）：默认分析单频模型、5/5 证据、Worker、参数/候选/证据/体检区块齐全、窄视口无溢出。
- **学习页**（learn.html）：15 场景目录按类分组、进度 0/15、四步引导（观察→假设→验证→结论）正常；假设步显示原理、验证步显示分析结果；主题切换/导航正常。
- **导入/导出兼容**：统一版本后 `static.test` 通过——前端 app.js/learn-app.js 的导入与后端 service/learn/dsp/charts 导出完全匹配。
- **核心数值内核一致**：`dsp.js/csv.js/mat.js` 与 integration 完全相同；`service.js/worker` 逻辑相同（仅版本标签差异）。
- **控制台**：仅本地 `/functions/v1/app/health` 404（预期，本地无 Function），无其他错误。

## 二、问题清单 ⚠️

### P1 — 版本标签混用（阻断 static.test）
- 前端 UI 用 `?v=12`，integration 后端已 `?v=15`。组合后 `static.test` 报 `mixed module versions: 15, 12`。
- 统一为 15 后静态检查通过。**集成时必须统一版本号**（约定集成期由后端统一递增）。

### P2 — generator.js 缺失（实验沙盒后端丢失）
- `origin/UI` 的 `site/dist/` **无 generator.js**（integration 有，29 条件产生器）。
- learn-app.js 不含 `runExperiment/CONDITION_CATALOG`，即**随机实验沙盒 UI 未做**（FRONTEND-TODO P2）。
- 影响：学习页只有固定场景，缺"随机条件→分析→数据驱动结论"沙盒。

### P3 — learn.js 分叉
- UI 的 learn.js 是**自包含旧版**（独立 seededNoise/gaussian/合成器，仅 import dsp）；integration 的 learn.js 委托 `generator.synthesizeSignal`。
- 两者场景同为 15 个、导出 API 同名（listScenarios/getScenario/generateScenarioSignal/analyzeScenario/buildLearnPayload），**功能兼容**，但代码分叉、合成器重复。
- 建议：统一采用 integration 的 learn.js（依赖 generator），避免双份合成器。

### P4 — 基于旧 main 而非 integration
- UI 分支从 main（5b52bde "Add files via upload"）分出，未基于 integration，故缺最新后端成果（generator、数据驱动 outcome、v=15、文档）。
- 建议：前端改基于 `integration` 开分支开发（见 COLLABORATION.md）。

### P5 — 压力测试渲染契约差异（E2E 失败）
- 前端 `renderStress`：`stressList.replaceChildren(summary, ...result.variants.map(...))`，在 `#stress-list` 内**额外插入 summary 元素** → 子元素 = 1+4 = **5**。
- 后端 `stressTest` 返回 **4** 变体；E2E 断言 `#stress-list` 子元素 == 4 → **失败**（`stress variants: 5`）。
- 非功能 bug（压力测试本身正常显示 summary+4 变体），但渲染结构与 E2E 契约不符。
- 建议：前端把 summary 放入 `#stress-summary`（stress-list 仅留变体行），或 E2E 改为计数变体行。需双方对齐。

### P6 — 学习进度标记交互（待确认，非确定 bug）
- 自动推进四步后进度仍 0/15，未自动标记"已学"。
- 推测为设计行为：需在结论步**手动核对结论后标记**（防跳过学习）。需前端确认交互意图；若需自动标记则补逻辑。

## 三、结论
组合后**核心功能可用**（分析页 + 学习页四步流程），数值内核未被破坏，导入导出兼容。主要问题是**协作流程层面**（基于旧 main、版本回退、generator 缺失、learn.js 分叉）与**一处渲染契约差异**（stress-list 5 vs 4）。

## 四、建议的 reconcile 方向（需许可后执行）
1. 以 integration 为后端基线（恢复 generator.js + 最新 learn.js + v=15）。
2. 保留前端 UI（app/index/styles/learn-app/learn.html/learn.css/charts）。
3. 对齐 stress-list 渲染契约（P5）。
4. 前端补实验沙盒 UI（P2，consume generator.runExperiment）。
5. 统一版本、跑全套 + E2E 验证后合并 integration。