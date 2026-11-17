# SignalInsight 前端交接文档

> 面向：负责 **UI 设计与渲染** 的前端协作者。
> 你的搭档（后端）负责数值/逻辑。本文件让你独立上手、并行开发、不冲突。
> 配套：`COLLABORATION.md`（协作流程）、`CONTRACT.md`（数据契约 v1.0）、`HANDOFF.md`（项目全局）。
> 更新：2026-11-17 · 模块版本 v=10 · 契约 v1.0

---

## 1. 项目是什么（一句话）

浏览器端信号**模型辨识 + 参数估计 + 多模型竞争 + 可信度分析**平台（StudyHack 参赛）。所有数值在浏览器本地算，Qwen 只做解释。当前是单页 SPA，**无构建步骤**（浏览器直接加载 ES module）。

你的任务：重做/优化 UI 视觉与交互。后端功能保持稳定，你按契约消费数据即可。

## 2. 获取代码

```bash
git clone https://github.com/y3pth/SignalInsight.git
cd SignalInsight
git checkout integration                 # 协作基线
git checkout -b frontend/ui-redesign     # 你的任务分支
```

- 仓库为 **私有**。国内若 clone GitHub 失败，需代理/VPN（后端本机经 `127.0.0.1:7890` 代理访问 GitHub；Gitee 可直连，必要时可加镜像）。
- 每次开工先同步基线：`git checkout integration && git pull --ff-only`，再 `git checkout frontend/ui-redesign && git merge integration`。

## 3. 你的所有权边界（冲突预防核心）

**你拥有（可自由修改）：**
- `site/dist/index.html` — 页面结构
- `site/dist/styles.css` — 视觉/响应式
- `site/dist/app.js` — UI 状态、渲染、图表、事件绑定（**渲染层**）
- `site/test/e2e.mjs` — UI 端到端测试（后端可协助）

**后端拥有（不要改）：**
- `site/dist/service.js`、`dsp.js`、`csv.js`、`mat.js`、`analyzer-worker.js`
- `site/functions/*`
- 逻辑测试 `site/test/{dsp,csv,extreme,mat,iq,function,fixtures,ai-consistency,static,contract}.test.mjs`
- `CONTRACT.md`（后端维护）

规则：**不编辑后端文件**。需要新数据字段/新逻辑 → 在 `HANDOFF.md` 协作日志提案，后端按加法演进提供。

## 4. 本地运行与预览

```bash
python -m http.server 4173 --bind 127.0.0.1 --directory site/dist
# 浏览器打开 http://127.0.0.1:4173
```

- 本地**没有 Edge Function**：AI 按钮显示"AI 服务不可达"，`/functions/v1/app/health` 404 —— **这是预期**，不是 bug。
- 要验证真实 Qwen，需用公开站点（当前线上为旧版）或发布后。
- 无 bundler/编译：改 `site/dist/` 即生效；注意浏览器缓存（见 §10 版本号）。

## 5. 页面结构地图（index.html）

左侧 `control-block`：数据源 tabs（单频/双频/噪声示例）、`#csv-file`、`#mat-file`、`#mat-rate`、`#mapping-panel`（时间/信号/Q 列映射、`#iq-mode`）、`#analyze-button`。

右侧 `workspace` 卡片顺序：
| 卡片 | 关键 id |
|---|---|
| 结果头 | `#recommended-model` `#reliability-badge` `#result-subtitle` `#download-button` |
| 可信结论卡 `#conclusion-card` | `#conclusion-title` `#conclusion-confidence` `#conclusion-summary` `#conclusion-evidence` `#conclusion-change` |
| 指标卡 | `#metric-samples/rate/r2/rmse/gap/resolution/duration` |
| 图表 | `#time-chart` `#spectrum-chart` `#residual-chart`（Canvas） |
| 候选竞争 | `#candidate-body`（表） |
| 推荐参数 | `#parameter-body`（表） |
| 多通道 `#channel-card` | `#channel-button` `#channel-summary` `#channel-list` |
| 数据体检/实验设计 | `#health-status` `#health-list` `#design-list` |
| 调制解构 `#modulation-lab` | `#modulation-type` `#modulation-chart` `#modulation-facts` `#modulation-sidebands` |
| 压力测试 | `#stress-button` `#stress-summary` `#stress-list` |
| 可信度引擎 | `#evidence-list` `#limitation-list` `#next-step-list` |
| AI 解释层 | `#model-select` `#ai-button` `#ai-summary` `#ai-observations` `#ai-limitations` `#ai-status` |
| 分析历史 | `#history-list` `#history-detail` `#history-clear` |
| 全局 | `#toast` `#result-announcer`（aria-live） |

## 6. app.js 渲染层地图（当前行号近似，会随编辑漂移）

- 入口/状态：`elements`（DOM 引用表）、`state`（UI 状态：result/dataVersion/resultStale/aiRequestSequence/history…）、`init()`、`bindEvents()`。
- 主渲染：`render(result)` (~723) 调度下列函数。
- 子渲染：`renderConclusion` (540)、`renderHealth` (563)、`renderModulation` (619) + `drawModulationChart` (605)、`renderStress` (668)、`renderCandidates` (772)、`renderParameters` (802)、`renderEvidence` (834)、`renderCharts` (1045) + `drawPlot` (950)、`renderLocalExplanation` (890)、`renderQwenExplanation` (877)、`renderAiLimitations` (865)、`renderHistory` (1171)、`renderHistoryDetail` (1199)、`renderCsvPreview` (182)、`renderChannelResults` (343)。
- 交互：`populateMapping` (246)、`updateChannelCard` (327)、`focusEvidence` (525)、`runStressTest`、`analyzeCurrent`、`analyzeAllChannels`、`downloadReport`（触发下载）、`requestQwenExplanation`（缓存+竞态守卫）、`showToast`。
- 工具：`formatNumber`、`escapeHtml`。

**你改 UI 主要动这些渲染函数 + index.html + styles.css。** 数据获取/Worker/AI fetch/历史存储已抽到后端 `service.js`，通过 import 调用，不要重写其逻辑。

## 7. 你消费的数据契约（详见 CONTRACT.md）

后端 `service.js` 暴露（DOM-free，返回数据）：
```js
analyzeSignalSafely(time, values) -> Promise<Result>
analyzeIqSafely(time, i, q)       -> Promise<Result>
stressTestSafely(time, values, baseline) -> Promise<StressResult>
fetchAiHealth()                   -> Promise<{configured, health, provider}>
fetchExplanation(payload, model, signal) -> Promise<Explanation>
buildReport(result, sourceLabel)  -> ReportObject
getHistory() / addHistory(result, source) / clearHistoryStorage()
```

`Result` 核心字段（完整见 CONTRACT.md §1）：
`kind, sampleCount, sampleRate, duration, nyquist, spectrum, health{status,checks,limitations}, candidates[], best, unknown, recommendedId, reliability{level,label,evidence,limitations,nextSteps,bicGap}, series{time,observed,fitted,residual}, iq?, engine`。

UI 渲染规则：
- `unknown===true` → 不展示参数结论（`renderParameters` 显示"无可靠参数估计"）。
- `reliability.level` ∈ reliable/caution/unreliable/insufficient_evidence → 对应徽章样式。
- `health.status` ∈ ok/warn/fail → "通过/有警告/有异常"。
- `candidates`/`best` 是**摘要**（无 fitted/residual 大数组）；只有 `series` 带最佳序列用于画图。
- AI `Explanation` = `{summary, observations[], limitations[]}`，**纯文本**，绝不回写数值。

## 8. 独立开发（不依赖后端实时运行）

- 样例结果：`site/test/fixtures/sample-result.json`（单频真实结果）、`sample-unknown.json`（噪声 unknown）。可直接喂给渲染函数调样式。
- 各 CSV fixture（`single-tone-noisy.csv`、`am-noisy.csv`、`iq-single.csv`、`multi-channel.csv`、`clipped-tone.csv` 等）可走真实上传→分析路径。
- 也可 import 稳定的 `service.js`/`dsp.js` 跑真实分析（后端 DOM-free，稳定）。
- MAT 夹具：`site/test/fixtures/two-column.mat`。

## 9. 必须遵守的不变量

1. **契约加法**：不要求后端删/改既有字段；新需求走提案。忽略未知字段。
2. **AI 只解释**：不得让 AI 输出改写数值/可信等级；`renderQwenExplanation` 只渲染文本。
3. **结果过期守卫**：`state.resultStale`/`dataVersion`/`resultVersion`/`aiRequestSequence` 机制不要破坏——数据变更后禁用 AI/导出/压力，旧 AI 响应不得覆盖新结果。
4. **unknown 拒绝结论**：证据不足时不强行给参数。
5. **不碰后端文件**；`service.js` 保持 DOM-free（你不要往里加 DOM 代码）。
6. **可访问性**：保留 `#result-announcer` aria-live 播报、Canvas aria-label。

## 10. 版本号与缓存（重要）

- 所有模块/资源带 `?v=N`（当前 v=10），`static.test.mjs` 强制单一版本。
- **并行开发期间你不要改 `?v=`**；集成入 `integration` 后由后端统一递增。
- 改 `index.html` 结构时保留 script/link 的 `?v=` 原值。
- 本地调试若看到旧行为，强制刷新（Ctrl+F5）或临时改 query 绕过缓存。

## 11. 异步协作流程

1. 开工：同步 `integration` → merge 进自己分支（§2）。
2. 只改自己所有的文件（§3）。
3. 收尾跑门禁：`node site/test/e2e.mjs`（UI）+ 目视/响应式；后端跑逻辑测试。
4. 合并入 `integration` 前**双方门禁都绿**；同一时间只一人合并，合并前在协作日志声明。
5. 在 `HANDOFF.md` §14 协作日志写：日期/角色/分支/契约版本/改动/阻塞/下一步。
6. 不强推、不重写历史、不直接改 `main`。

## 12. 测试与质检

- E2E：`node site/test/e2e.mjs`（零依赖，需本机 Chrome/Edge；用内置 WebSocket+CDP 驱动 headless 浏览器）。
- 覆盖 14 场景：默认示例、模型选择器、单频/多通道/IQ/噪声、AM/FM 调制、压力测试、报告导出、缺陷体检、MAT、历史、控制台无错误。
- 改 UI 后务必跑 E2E；它断言关键 DOM id/文案，**改 id 或文案需同步更新 e2e.mjs**（你是 e2e.mjs 所有者）。
- 窄视口检查无横向溢出（历史已验证 516px/703px 无溢出）。

## 13. 常见陷阱

- 无构建步骤：import 路径带 `?v=`；新增模块要带版本且与全局一致（集成期后端统一）。
- Worker 优先：分析在 `analyzer-worker.js`；主线程回退。UI 不要阻塞主线程做重计算。
- `app.js` 较大（~1300 行渲染层）：建议按卡片逐步重构，每步跑 E2E。
- 本地 AI 不可达是预期（§4）。
- Canvas 图表用 `drawPlot`；重绘入口 `renderCharts`，resize 有防抖。

## 14. 当前状态与方向

- 已发布线上版本 = 信任实验室（旧）；本地 `integration` 含 P1/P2 扩展 + Qwen 具体化 + 模型白名单 + service.js 拆分，**尚未发布**。
- 你的近期目标：UI 视觉/交互重做。后续可能有"学习模式"双页面（规划中，见 HANDOFF §11），届时新增页面/模块，仍共享后端内核。
- 后端待命可按契约加法提供新数据/功能。

## 15. 学习模式页面（learn.html）开发指引

后端学习库 `learn.js` 已就绪（M1：`clean-single` / `clipped-tone`）。你建独立 `learn.html` 消费它，与分析页状态隔离。

**API（详见 CONTRACT.md §8）：**
```js
import { listScenarios, getScenario, generateScenarioSignal, analyzeScenario } from "./learn.js?v=10";
listScenarios()      // 场景目录 [{id,title,category,difficulty,summary}]
getScenario(id)      // 完整场景（principle/diagnosis/questions/steps/expected）
analyzeScenario(id)  // { scenario, result, match }；result 同分析模式 Result；match.ok=是否符合预期
```

**样例数据（独立开发，无需后端实时）：**
- `site/test/fixtures/sample-scenario-list.json`（目录）
- `sample-scenario-clean.json`（干净单频完整分析）
- `sample-scenario-defect.json`（削顶缺陷完整分析）

**建议 UI 结构（你全权设计）：**
1. 场景目录：`listScenarios()` 渲染卡片（标题/类别/难度/简介）。
2. 场景学习页：
   - 观察：信号时域/频谱预览（`generateScenarioSignal` + 复用 `drawPlot`，或样例 `result.series`）。
   - 原理卡：`principle.concept` + `points`；`evidenceIds` 可链接证据。
   - 分步引导：`steps` = observe→hypothesize→verify→conclude，逐步揭示。
   - 验证/对照：渲染 `analyzeScenario(id).result`（复用分析模式渲染），`match.ok` 给"符合预期"反馈。
   - 诊断（缺陷场景）：`diagnosis.issues/causes/improvements`。
   - 思考题：`questions`；进度：localStorage（前端自有）。
3. 与分析页导航互通（index.html ↔ learn.html）。

**约束：**
- 不改 `learn.js`/`dsp.js`（后端）；原理自然语言展开后续由 Qwen（M2）提供，仍只解释不改数值。
- 复用 Result 渲染规则（unknown 拒绝结论、可信度徽章、体检状态）。
- `learn.html` 模块 import 带 `?v=10`（与全局一致；集成期后端统一递增）。
- 学习页 E2E 由你补充。

## 16. 关键文件速查

| 用途 | 文件 |
|---|---|
| 页面结构 | `site/dist/index.html` |
| 视觉 | `site/dist/styles.css` |
| UI 渲染/事件 | `site/dist/app.js` |
| 后端逻辑 API | `site/dist/service.js`（只读消费） |
| 学习库 API | `site/dist/learn.js`（只读消费） |
| 学习页（你建） | `site/dist/learn.html` + 学习渲染 |
| 学习样例 | `site/test/fixtures/sample-scenario-*.json` |
| 数据契约 | `CONTRACT.md` |
| 协作流程 | `COLLABORATION.md` |
| 全局交接/协作日志 | `HANDOFF.md` |
| 样例数据 | `site/test/fixtures/sample-result.json` 等 |
| UI 测试 | `site/test/e2e.mjs` |

有疑问或需要后端加字段：写 `HANDOFF.md` 协作日志，后端会响应。祝开发顺利。