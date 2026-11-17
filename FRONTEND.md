# SignalInsight 前端交接文档

> 面向：负责 **UI 设计与渲染** 的前端协作者。
> 你的搭档（后端）负责数值/逻辑。本文件让你独立上手、并行开发、不冲突。
> 配套：`COLLABORATION.md`（协作流程）、`CONTRACT.md`（数据契约 v1.0）、`HANDOFF.md`（项目全局）。
> 更新：2026-11-17 · 模块版本 v=14 · 契约 v1.0

---

## 0. 开工提示词（给前端协作者的阅读顺序）

> 把下面这段直接发给前端会话/开发者即可开工。

```text
你是 SignalInsight 的前端协作者，负责 UI 设计与渲染（分析页 index.html + 学习页 learn.html）。
后端由另一会话负责，你们通过 git + 契约异步协作。请按以下顺序阅读并开工：

1. FRONTEND.md（你的主交接文档）——重点 §3 所有权边界、§5 页面结构、§6 渲染层地图、
   §7 数据契约、§15 学习页完整施工规格。
2. COLLABORATION.md——协作流程：分支模型、同步节奏、版本号协调、合并门禁、协作日志。
3. CONTRACT.md——接口契约 v1.0：Result 形状（§1）、service.js API（§5）、学习库 API（§8）。
4. HANDOFF.md §14 协作日志——最新进度与阻塞；§11 学习模式规划。
5. 代码与样例：site/dist/index.html / app.js / styles.css（分析页）；site/dist/learn.js（只读消费）；
   site/test/fixtures/sample-result.json、sample-scenario-*.json（独立调 UI 用）。

开工步骤：
- git clone https://github.com/y3pth/SignalInsight.git（国内需代理/VPN）
- git checkout integration && git pull --ff-only
- git checkout -b frontend/<任务>
- 本地预览：python -m http.server 4173 --bind 127.0.0.1 --directory site/dist
- 只改你拥有的文件（index.html / styles.css / app.js / learn.html / 学习渲染 / e2e.mjs）；
  不碰后端 service.js / learn.js / dsp.js / functions。
- 改 UI 后跑 node site/test/e2e.mjs；合并入 integration 前双方门禁都绿。
- 需要后端加字段/新场景：写 HANDOFF.md 协作日志提案，后端按加法演进提供。

硬约束：AI 只解释不改数值；unknown 拒绝结论；并行期不改 ?v=（集成期后端统一递增）；
不强推、不重写历史、不直接改 main。
```

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

- 所有模块/资源带 `?v=N`（当前 v=14），`static.test.mjs` 强制单一版本。
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

## 15. 学习模式页面（learn.html）完整施工规格

后端学习库 `learn.js` 已就绪（**15 个场景（含 IQ）**，覆盖 clean/modulation/defect/out-of-library；M2 Qwen 原理展开已接入）。本节让你**独立、无歧义**地建好 `learn.html`。你拥有 `learn.html` + 学习渲染模块 + 相关样式；`learn.js`/`dsp.js` 归后端，只读消费。

### 15.1 目标与边界
- 建独立页面 `site/dist/learn.html`（与分析页 `index.html` 平级），状态隔离，互不干扰。
- 学习模式 = 用仿真场景引导理解"为什么这样选模型 / 数据哪里有问题"，**原理先行**，结合具体证据数值。
- 你只做 UI/交互/渲染；数值、场景数据、分析全部来自后端 API。不要重写分析逻辑。

### 15.2 快速开始
```html
<!-- learn.html -->
<script type="module" src="./learn-app.js?v=14"></script>
```
```js
// learn-app.js（前端自有，命名自定）
import { listScenarios, getScenario, generateScenarioSignal, analyzeScenario } from "./learn.js?v=14";
import { analyzeSignal } from "./dsp.js?v=14"; // 仅在需要自行重算时；通常直接用 analyzeScenario
const catalog = listScenarios();           // 渲染目录
const { scenario, result, match } = analyzeScenario("clean-single"); // 渲染学习页
```
- 所有 import 带 `?v=14`（与全局一致；集成期后端统一递增，你不要改）。
- 无构建步骤；可复用 `styles.css` 或新建 `learn.css`。

### 15.3 API 详解（CONTRACT.md §8）
| 函数 | 返回 | 用途 |
|---|---|---|
| `listScenarios()` | `[{id,title,category,difficulty,summary}]` | 场景目录卡片 |
| `getScenario(id)` | `Scenario \| null` | 取场景定义（原理/诊断/思考题/步骤/预期），不含分析 |
| `generateScenarioSignal(id)` | `{kind,time,values,i?,q?}` | 合成仿真信号（画时域/频谱预览用） |
| `analyzeScenario(id)` | `{scenario,result,match}` | 一步拿到场景+分析结果+预期对照 |

- 未知 id：`getScenario` 返回 `null`；`generateScenarioSignal`/`analyzeScenario` 抛 `Error("未知学习场景：…")`。UI 需兜底。
- `analyzeScenario` 内部已调用 dsp 分析，**你无需再算**；`result` 即分析模式同款 `Result`。

### 15.4 场景 Schema 逐字段（getScenario / scenario）
| 字段 | 类型 | 渲染建议 |
|---|---|---|
| `id` | string | 路由/进度 key |
| `title` | string | 标题 |
| `category` | `clean`/`modulation`/`defect`/`out-of-library` | 分类标签/配色 |
| `difficulty` | number(1–) | 难度星级 |
| `summary` | string | 简介 |
| `signal` | `{kind,fs,n,seed,components,offset,noiseSigma,clip?}` | 一般不直接展示；供"观察"步生成信号 |
| `groundTruth` | object | "真值"对照（如 frequency/amplitude），验证步展示 |
| `expected` | `{unknown?,model?,reliability?,health?,healthChecks?}` | 预期结论，验证步与 result 对照 |
| `principle` | `{concept,evidenceIds[],points[]}` | **原理卡**：concept 概述 + points 逐条；evidenceIds 可链接证据 |
| `diagnosis` | `null \| {issues[],causes[],improvements[]}` | 缺陷场景的"问题诊断"卡；clean 场景为 null（隐藏） |
| `questions` | string[] | 思考题列表 |
| `steps` | `["observe","hypothesize","verify","conclude"]` | 分步引导顺序 |

### 15.5 analyzeScenario 返回结构（实测）
```js
{
  scenario: { /* 15.4 全部字段 */ },
  result: { kind, createdAt, sampleCount, sampleRate, duration, nyquist,
            spectrum, health, candidates, best, unknown, recommendedId,
            reliability, series },        // 与分析模式 Result 完全一致
  match: { ok: true, checks: [true,true,true,true] }  // 实际是否符合 expected
}
```
- `match.ok===true` → 给"符合预期 ✓"正向反馈；false → 提示"与预期不符"并展示差异（后端场景保证 ok，false 属异常）。
- `result` 渲染规则**完全复用分析模式**（见 §7）：unknown 拒绝结论、reliability 徽章、health 状态、candidates 摘要、series 画图。

### 15.6 页面结构与组件（你全权设计，以下为推荐）
**A. 场景目录视图**
- `listScenarios()` → 卡片网格：title / category 标签 / difficulty / summary。
- 点击卡片 → 进入该场景学习视图（可用 hash 路由 `learn.html#clean-single`，无需后端）。
- 显示学习进度徽标（已学/未学，见 15.9）。

**B. 场景学习视图**（按 steps 分步揭示）
1. 头部：title + category + difficulty + summary + "返回目录"。
2. 原理卡：`principle.concept` + `principle.points`（逐条）；`evidenceIds` 渲染为可点击 chips（点击高亮对应证据/图表）。
3. 分步区（15.7）：observe → hypothesize → verify → conclude。
4. 问题诊断卡（仅 `diagnosis!==null`）：issues / causes / improvements 三段。
5. 思考题卡：`questions` 列表（可折叠参考答案——答案可由后续 Qwen M2 提供，M1 先留空或静态）。
6. 底部：标记"已学"按钮（写进度）+ 上一/下一场景导航。

### 15.7 分步引导设计（steps）
| 步 | 揭示内容 | 数据来源 |
|---|---|---|
| observe（观察） | 信号时域波形 + 频谱预览；提示"你看到了什么" | `generateScenarioSignal(id)` + 复用 `drawPlot`；或 `result.series`/`result.spectrum` |
| hypothesize（假设） | 原理卡 concept + points；引导"可能是什么模型/有什么问题" | `scenario.principle` |
| verify（验证） | 运行分析，展示 result（候选竞争/参数/体检/证据）+ groundTruth 对照 | `analyzeScenario(id).result` + `scenario.groundTruth` |
| conclude（结论） | 推荐模型/可信度 + `match.ok` 反馈 + 诊断（若有）+ 思考题 | `result.recommendedId/reliability` + `match` + `scenario.diagnosis/questions` |

- 交互建议：默认只显示当前步，"下一步"按钮推进；允许回看。进度条 4 段。
- 画图复用 `app.js` 的 `drawPlot`（若抽成共享模块更好）；或直接用样例 `result.series` 静态渲染。

### 15.8 数据流
```
listScenarios() → 目录
  → 用户选场景 id
  → getScenario(id) → 原理卡/诊断/思考题/步骤（静态内容）
  → generateScenarioSignal(id) → observe 步画图
  → analyzeScenario(id) → verify/conclude 步渲染 result + match
  → 标记已学 → localStorage 进度
```
- 分析在浏览器本地（dsp/Worker），学习页无需 Edge Function；AI 原理展开（M2）才需 Function。
- 不要缓存/改写 `result` 数值；渲染只读。

### 15.9 学习进度（前端自有，localStorage）
建议 key `signalinsight.learn.v1`，结构自定，例如：
```js
{ completed: ["clean-single"], lastVisited: "clipped-tone", updatedAt: ISO }
```
- 目录据此显示"已学"徽标；学习视图"标记已学"写入。
- 容量小（场景 id 列表），无配额风险；损坏时降级为空。

### 15.10 导航与共享
- `index.html`（分析）↔ `learn.html`（学习）顶部互链。
- 共享后端模块：`dsp.js`/`service.js`/`learn.js`（只读）。
- **状态隔离**：学习页用自己的 UI 状态，不复用分析页 `state`；避免互相污染。
- 可复用 `styles.css` 设计变量（`--accent`/`--surface`/`--border` 等）保持视觉一致。

### 15.11 样例数据（独立开发，无需后端实时）
| 文件 | 内容 | 用途 |
|---|---|---|
| `site/test/fixtures/sample-scenario-list.json` | `listScenarios()` 输出（15 场景） | 调目录 UI |
| `sample-scenario-clean.json` | `analyzeScenario("clean-single")` 完整输出 | 调干净场景学习页 |
| `sample-scenario-defect.json` | `analyzeScenario("clipped-tone")` 完整输出 | 调缺陷场景学习页（含 diagnosis） |
| `sample-scenario-am.json` | `analyzeScenario("am-tone")` 完整输出 | 调调制场景学习页 |
| `sample-scenario-chirp.json` | `analyzeScenario("chirp")` 完整输出 | 调库外/unknown 场景学习页 |
| `sample-scenario-iq.json` | `analyzeScenario("iq-single")` 完整输出 | 调 IQ 场景学习页（result.kind="iq"，含 iq.q） |

直接 `fetch`/import 这些 JSON 喂渲染函数即可调样式，不必跑分析。

### 15.12 测试与验收
- 补学习页 E2E（`e2e.mjs` 扩展或独立 `learn-e2e.mjs`，你拥有）：目录渲染 2 场景 → 进入 clean-single → 四步推进 → result 显示 single_tone/reliable → 标记已学 → 刷新进度仍在 → 进入 clipped-tone → diagnosis 显示 + health 有异常。
- 验收标准（Definition of Done）：
  1. 目录正确列出后端场景（不硬编码场景内容）。
  2. 四步引导可推进/回看，原理卡/诊断/思考题按 schema 渲染。
  3. verify 步 result 渲染复用分析模式规则（unknown/徽章/体检）。
  4. `match.ok` 反馈正确；缺陷场景显示 diagnosis。
  5. 进度持久化；导航互通；窄视口无溢出；控制台无错误。
  6. 不改后端文件；import 带 `?v=14`。

### 15.13 约束与陷阱
- **不改 `learn.js`/`dsp.js`/`service.js`**；需新场景/字段 → HANDOFF 协作日志提案，后端加法提供。
- AI 只解释不改数值（M2 接入时同样约束）；M1 原理用后端结构化 `points`，不要自行编造数值结论。
- unknown 场景拒绝参数结论；可信度/体检文案与分析模式一致。
- `?v=` 并行期不改；本地调试旧行为用 Ctrl+F5。
- 场景内容由后端保证准确性；前端只渲染，不改写原理文本语义。

### 15.14 两个场景的具体呈现（实测参考）
**clean-single（干净单频）**
- category=clean，difficulty=1。
- 原理 evidenceIds：`spectral_prominence / fit_quality / residual_whiteness / frequency_resolution`。
- verify：`result.recommendedId="single_tone"`，reliability=`reliable`，health=`ok`，频率≈93.7001 Hz（groundTruth 93.7）。
- diagnosis=null（隐藏诊断卡）；match.ok=true。
- 思考题：为什么不用双频/BIC 作用；观测减半对分辨率的影响。

**clipped-tone（削顶失真）**
- category=defect，difficulty=2。
- 原理 evidenceIds：`data_health / spectral_prominence / residual_structure`。
- verify：health=`fail`（clipping=fail），reliability=`unreliable`，模型竞争可能选多频（削顶谐波）——**这正是教学点：高 R² 也不可信**。
- diagnosis：issues=["削顶/饱和：幅值 2 超量程 ±1"]，causes=["增益过高/ADC 量程不足"]，improvements=["降增益/扩量程","重采确认 clipping 通过再分析"]。
- match.ok=true；思考题：削顶为何诱导多频；高 R² 为何仍不可信。

### 15.15 M2：Qwen 原理自然语言展开（已接入）

后端已提供 `/functions/v1/app/learn-explain`，把结构化原理展开为自然语言讲解（仍只解释、不改数值）。

- 后端 `learn.js` 导出 `buildLearnPayload(scenario, result)` → 学习 payload（concept/points/evidence/diagnosis/groundTruth）。
- 前端经 `service.js` 调用：
```js
import { fetchLearnExplanation } from "./service.js?v=14";
import { buildLearnPayload, analyzeScenario } from "./learn.js?v=14";
const { scenario, result } = analyzeScenario(id);
const payload = buildLearnPayload(scenario, result);
try {
  const explanation = await fetchLearnExplanation(payload, model, AbortSignal.timeout(30000));
  // explanation = {summary, observations[], limitations[]}
  // 渲染到原理卡：summary=讲解，observations=循序渐进要点，limitations=常见误区
} catch (error) {
  // 降级：直接渲染 scenario.principle.points（结构化要点），学习页不阻塞
}
```
- 本地无 Function 时 `fetchLearnExplanation` 抛错 → **必须降级**到结构化 `points`（M1 内容），学习页仍可用。
- 模型选择复用分析页 `#model-select` 或学习页自有选择器（白名单 qwen-plus/max/turbo/long）。
- 不变量：AI 输出纯文本，绝不回写数值/可信等级；缓存可按 payload+model（参考分析页 `aiCache`）。

### 15.16 随机数据产生器（generator.js，实验沙盒）

后端提供 `generator.js`，随机生成**严格模拟真实条件**的数据并分析，告诉用户"这种条件会得到什么结果"。

```js
import { CONDITION_CATALOG, runExperiment, generateRandomSignal } from "./generator.js?v=14";
CONDITION_CATALOG;  // 29 种条件菜单：clean/noisy/clipped/quantized/drift/jitter/aliasing/near-nyquist/short/multi/am/fm/iq/chirp/noise/invalid-short/invalid-jitter/harmonics/spike/dropout/close-tones/over-modulation/weak-signal/few-cycles/exact-nyquist/mains-hum/invalid-nonincreasing/invalid-nan/invalid-toolong
const exp = runExperiment({ condition: "aliasing", seed: 42 });
// exp = { params, groundTruth, conditions, data, result, outcome }
// outcome.verdict: correct-model | caution-boundary | unreliable-defect | unknown-rejected | aliasing-warning | input-rejected
// outcome.notes: 面向用户的结论解释（混叠真值对照 / 缺陷诊断 / 边界拒绝原因）
```

- UI 建议：条件选择器（`CONDITION_CATALOG`）+ "随机生成"（`condition:"random"`）+ seed 输入（可复现）→ 展示 `data` 波形/频谱 + `result` 分析 + `groundTruth` 真值对照 + `outcome.notes` 结论。
- 教学重点：`aliasing` 展示"真频超 Nyquist → 分析得混叠假频"；`invalid-*` 展示边界拒绝；defect 展示体检诊断。
- 大样本（>5 万）宜用 service Worker 分析 `data`，而非 `runExperiment` 主线程。
- 产生器 DOM-free，只读消费；不改 `generator.js`（后端）。

> 完成本节即可独立交付 learn.html（15 场景 + M2 原理展开 + 随机实验沙盒 + 降级）。需新场景/条件/字段写 HANDOFF 协作日志，后端加法提供。

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