# SignalInsight 工程转接文档

> 更新日期：2026-11-17
> 适用对象：接手本项目的下一个 Qoder 对话
> 阅读顺序：本文件 → `AGENTS.md` → `README.md` → `HANDOFF.md` → `立项确定书.md`
> 前后端分离协作：`COLLABORATION.md`（流程）+ `CONTRACT.md`（接口契约 v1.0）
> 当前分支：`feat/trust-lab`
> 最近代码提交：`48ad325 feat: add multi-channel, MAT and IQ data modes`
> 转接文档：`TRANSFER.md`
> 工作区状态：干净
> 公开站点：<https://signal-insight-s31b5iv5ld0.qoder.zone>
> 当前线上 action：`2751a5c0-6fea-48f6-9a4b-887c1e95c0bb`
> 线上健康检查：`{"ok":true,"configured":true,"provider":"dashscope-compatible"}`

---

## 0. 新对话启动清单

新对话开始前按顺序执行：

```bash
git status --short --branch
git branch --show-current
git log -5 --oneline
```

然后确认：

1. 当前应在 `feat/trust-lab` 或新开的任务分支上，**不要直接修改 `main`**。
2. `main` 仍停留在 `ff2b226`，不包含本轮信任实验室功能；不要误以为 `main` 是当前交付版本。
3. 项目唯一交付物是 `site/` 下的 Qoder Sites 应用；**不要恢复 Python/FastAPI 后端**。
4. 新的任务由用户在新对话中指定；本文件只描述现状、边界和操作方法，不预设下一项任务。
5. 不要把 API Key、Qoder Token 或用户数据写入源码、聊天、命令行参数或 Git。
6. 发布统一走 Qoder CN 桌面端 Sites MCP，不要用 CN CLI 直接 `prepare_site`（原因见第 9 节）。

---

## 1. 项目是什么、有什么用

SignalInsight 是一个面向通信与信号处理实验的**浏览器端信号模型辨识、参数估计、模型竞争与可信度分析平台**。

它不是单纯的“画频谱工具”，核心区别是：

- 不默认接受最复杂的拟合模型，而是让单频、多频、AM、FM 等候选模型在同一口径下竞争；
- 当证据不足时输出 `unknown` / `insufficient_evidence`，拒绝强行给参数结论；
- 同时展示主谱峰、拟合质量、残差 ACF、残余谱、观测分辨率、数据体检等证据；
- 用 Qwen 把确定性数值解释成通信语言，但 AI 不能修改数值或可信等级；
- 对 AM/FM 显示调制结构，对参数给出近似不确定度；
- 用压力测试回答“哪些扰动会让结论翻转”。

典型使用场景：

- 通信原理 / 信号与系统实验课：判断一段观测数据适合哪种模型；
- 科研复现：先检查数据质量，再看模型是否可信；
- 比赛演示：展示“为什么不是更复杂的模型”“为什么这次拒绝给结论”。

---

## 2. 当前状态

### 2.1 线上

- 公开地址：<https://signal-insight-s31b5iv5ld0.qoder.zone>
- 访问模式：public
- Site ID：`01a1e4bb-ea05-7b36-88f4-72a743ddb34d`
- Project ID：`01a1e4bb-ea05-7036-8eea-6bdc90a0ab26`
- 当前线上 action：`2751a5c0-6fea-48f6-9a4b-887c1e95c0bb`
- Function：`app`，edge runtime，已发布
- Function 绑定 Secret：`DASHSCOPE_API_KEY`
- Qwen 已真实可用：单频、AM 已线上验证；IQ 分析已本地验证
- 当前页面包含：结论卡、证据链、数据体检、实验设计、AM/FM 解构、压力测试、多通道、MAT v5、IQ 单分量

### 2.2 Git

- 当前分支：`feat/trust-lab`
- 最新提交：`1c59a96`
- 本轮关键提交：
  - `e45afb0` 架构与数据流加固
  - `d5d7834` 结论卡与证据链
  - `b9a8720` 数据体检与实验设计
  - `352f630` AM/FM 解构实验室
  - `e4d6e4c` 反事实压力测试
  - `48ad325` 多通道 / MAT / IQ
- `main`：`ff2b226`，明显落后于当前分支
- 还有分支 `feat/ai-explanations`，包含更早的 AI UI / P1 / P2 工作
- 远端：`origin` = https://github.com/y3pth/SignalInsight.git（私有）；本机经 `127.0.0.1:7890` 代理访问 GitHub（直连不可达）
- 本轮提交使用仓库历史作者 `mathcrazy <u4893yhr39@outlook.com>`，通过环境变量提交，没有修改全局 Git 配置

### 2.3 验证状态

全部通过：

```bash
node site/test/dsp.test.mjs
node site/test/csv.test.mjs
node site/test/extreme.test.mjs
node site/test/mat.test.mjs
node site/test/iq.test.mjs
node site/test/function.test.mjs
node site/test/fixtures.test.mjs
node site/test/static.test.mjs
node site/test/ai-consistency.test.mjs
node site/test/contract.test.mjs
node site/test/learn.test.mjs
node site/test/generator.test.mjs
node site/test/e2e.mjs
```

当前基线：

- 单频 93.7002 Hz
- 双频 80.50 / 173.20 Hz
- 纯噪声 unknown
- AM 5 Hz / 调制指数 0.60
- FM 4 Hz / β≈2.00
- IQ 120 Hz / 复幅值 2 / 复相位 0.3
- 50 万点单频：Node 约 10 秒，浏览器 Worker 约 30 秒
- CSV 5 万行解析约 70 ms

---

## 3. 技术架构

### 3.1 总体结构

```text
浏览器（静态 SPA，无构建步骤）
├── site/dist/index.html
├── site/dist/styles.css
├── site/dist/app.js                  # 前端：UI 状态、输入映射、渲染、事件
├── site/dist/service.js              # 后端：Worker 编排、AI 请求、导出构建、历史存储（DOM-free）
├── site/dist/learn.js                # 后端：学习库（15 场景含 IQ/原理/诊断/思考题 + buildLearnPayload，DOM-free）
├── site/dist/generator.js            # 后端：随机数据产生器（17 条件真实模拟 + 真值感知结论，DOM-free）
├── site/dist/csv.js                  # CSV 解析
├── site/dist/mat.js                  # MAT v5 实数矩阵解析
├── site/dist/dsp.js                  # 数值内核（主线程回退 + Worker 共享）
└── site/dist/analyzer-worker.js      # Web Worker，导入 dsp.js

Qoder Sites Edge Function
├── site/functions/index.ts           # Deno.serve(handler)
└── site/functions/handler.ts         # /health、/explain、Qwen 代理

测试
├── site/test/*.test.mjs
└── site/test/fixtures/        # 12 个仿真拟真 CSV + manifest.json + generate.mjs（明确标注仿真）
```

没有 bundler 或 TypeScript 编译；浏览器直接加载 ES module；有零依赖静态检查（`static.test.mjs`）。修改 `site/dist/` 即是修改线上构建产物。前后端边界见 `CONTRACT.md` / `COLLABORATION.md`。

### 3.2 各文件职责

| 文件 | 职责 |
|---|---|
| `site/dist/index.html` | 页面结构：输入、映射、结果、结论卡、图表、候选、参数、通道、体检、调制、压力、证据、AI |
| `site/dist/styles.css` | 深色实验台视觉、响应式、状态/高亮样式 |
| `site/dist/app.js` | 前端：UI 状态、CSV/MAT/IQ 映射、渲染、图表、事件、AI 缓存/竞态守卫、下载触发 |
| `site/dist/service.js` | 后端：Worker 编排（analyze*Iq/stress Safely）、fetchAiHealth/fetchExplanation、buildReport、历史存储（DOM-free） |
| `site/dist/learn.js` | 后端：学习库 listScenarios/getScenario/generateScenarioSignal/analyzeScenario；场景含原理/诊断/思考题（DOM-free） |
| `site/dist/csv.js` | 分隔符识别、引号/换行解析、列数值化、时间列候选 |
| `site/dist/mat.js` | MAT v5 解析：数组 flags、维度、变量名、实数/复数矩阵 |
| `site/dist/dsp.js` | FFT、频谱、实数/复数拟合、AM/FM、IQ、可信度、体检、决策、设计、压力测试 |
| `site/dist/analyzer-worker.js` | Worker 消息协议；`analyze` / `iq` / `stress` 三种任务 |
| `site/functions/handler.ts` | 请求校验、输入重建、限流、Qwen 调用、输出解析 |
| `site/test/fixtures/two-column.mat` | SciPy 生成的 MAT v5 测试夹具 |

### 3.3 重要架构约定

1. **数值计算与 AI 解释分离**：Qwen 只解释 payload，不能改数值。
2. **Worker 优先，主线程回退**：DSP 在 Worker；Worker 失败或超时才回退主线程。
3. **结果必须有版本**：`dataVersion` / `resultVersion` / `resultStale` 防止旧结果被 AI/导出/压力测试使用。
4. **AI 响应必须有请求号**：`aiRequestSequence` 防止旧 AI 响应覆盖新结果。
5. **Worker 返回摘要，不返回所有候选的大数组**：候选只保留参数、指标、残差摘要；只有最佳序列进入 `series`。
6. **模块版本统一**：当前所有模块/资源统一 `?v=13`（`index.html` 的 `styles.css`/`app.js`，`app.js` 导入 `dsp.js`/`csv.js`/`mat.js`/`service.js`，`service.js` 导入 `dsp.js` 与 Worker URL，Worker 内 `dsp.js`）。任何前端改动后递增全部版本标签并保持一致；`static.test.mjs` 强制单一版本，避免主线程回退路径复用旧缓存。
7. **发布描述是生成的**：`site/.SignalInsight.qoder.site` 由 Sites 工具生成，不要手写字段。

---

## 4. 数据流

### 4.1 内置示例

```text
buildExample("single"|"dual"|"noise")
  → state.data = { time, values, label }
  → selectedSignal() 返回 kind:"real"
  → analyzeCurrent()
  → analyzeSignalSafely()
  → Worker type:"analyze"
  → analyzeSignal(time, values)
  → result
  → render(result)
```

### 4.2 实数 CSV（单通道 / 多通道）

```text
<input id="csv-file"> change
  → file.text()
  → parseCsv(text)
  → populateMapping(parsed, filename)
  → state.uploadedColumns = numericColumns
  → 映射面板：时间列 + 信号列（多通道时 channel 卡出现）
  → 用户点击“运行可信分析”
  → selectedSignal() 返回 kind:"real", time, values
  → Worker type:"analyze"
  → analyzeSignal(time, values)
  → render(result)
```

多通道：

```text
state.uploadedColumns
  → signalColumns() = 除时间列外的全部数值列
  → 用户点击“分析全部通道”
  → 对每个信号列串行调用 analyzeSignalSafely(time, column.values)
  → renderChannelResults()
  → 点击某行 → 设置 signal-column → analyzeCurrent()
```

注意：多通道是**逐通道独立分析**，不做通道间联合模型；通道卡在 IQ 模式下隐藏。

### 4.3 IQ CSV

```text
CSV 表头包含 I / Q（或用户勾选 IQ 模式）
  → state.inputMode = "iq"
  → 映射面板：时间列、I 列（signal-column）、Q 列（q-column）
  → selectedSignal() 返回 kind:"iq", time, i, q
  → analyzeIqSafely()
  → Worker type:"iq"
  → analyzeIqSignal(time, i, q)
  → render(result)
```

IQ 当前只支持**单分量复指数模型**；压力测试对该模式禁用，通道卡隐藏。

### 4.4 MAT v5

```text
<input id="mat-file"> change
  → file.arrayBuffer()
  → parseMat(buffer)
  → 取第一个 rows>0 & cols>0 的实数变量
  → matToParsed(variable, mat-rate)
       - cols === 1：用 mat-rate 生成 time；该列作为 signal
       - cols >= 2：第一列作为 time，其余列作为多通道信号
  → populateMapping()
  → 后续与实数 CSV 相同
```

复数 MAT、MAT v7.3/HDF5 当前会明确拒绝。

### 4.5 AI 解释

```text
页面加载
  → checkAiAvailability()
  → GET /functions/v1/app/health
  → state.aiHealth = configured | not_configured | unreachable

用户点击“用 Qwen 深入解释”
  → buildAiPayload(state.result)
  → aiCache 命中？直接渲染缓存
  → POST /functions/v1/app/explain
  → handler 校验/重建安全 payload
  → DashScope compatible-mode /chat/completions
  → Qwen 返回 JSON
  → parseModelText()
  → 返回 { summary, observations, limitations }
  → 前端检查 requestId / resultVersion / resultStale
  → renderQwenExplanation()
```

AI 失败时保留确定性解释；错误分为未配置、上游错误、格式错误、超时、限流等。

### 4.6 压力测试

```text
state.lastData（当前已分析的数据）
  → Worker type:"stress"
  → stressTest(time, values, baseline)
  → 4 个变体：
       - 加噪 20 dB
       - 加噪 10 dB
       - 观测减半
       - 降采样 2×
  → 每个变体 analyzeSignal()
  → 返回 recommendedModel / reliability / r2 / health / flipped
  → renderStress()
```

限制：仅实数模式、样本数 ≤ 50,000。

### 4.7 导出

```text
downloadReport()
  → 拒绝 stale 结果
  → 组装 product/version/source/sampleCount/sampleRate/duration/
    kind/recommendedModel/unknown/reliability/health/experimentPlan/
    modulation/candidates/method
  → Blob JSON 下载
```

---

## 5. 核心函数

### 5.1 `site/dist/dsp.js` 导出

| 函数 | 作用 |
|---|---|
| `mean(values)` | 均值 |
| `rms(values)` | 均方根 |
| `nextPowerOfTwo(value)` | FFT 长度补齐 |
| `computeSpectrum(values, sampleRate)` | 去均值 + Hann + radix-2 FFT + 幅度谱/峰/中位数基线 |
| `autocorrelation(values, lag)` | 自相关 |
| `validateSignal(time, values)` | 样本数、有限值、严格递增、抖动 ≤5%，返回 `{dt, sampleRate, duration}` |
| `inspectData(time, values, sampleRate, duration, spectrum)` | 数据体检：削顶、漂移、跳变、平稳性、阶梯/量化、Nyquist、周期数 |
| `analyzeSignal(time, values)` | 实数主分析：频谱 → 单/多频 → AM/FM → 阶梯选择 → 可信度/体检/决策 |
| `analyzeIqSignal(time, iValues, qValues)` | IQ 单分量复指数分析：复谱、频率精化、复系数拟合、可信度 |
| `templateExplanation(result)` | 确定性解释（无 Qwen 时） |
| `buildAiPayload(result)` | 构造给 Function 的结构化摘要（不含原始序列） |
| `buildDecision(result)` | 结论卡：依据 evidenceIds、whatWouldChange、alternatives |
| `buildExperimentPlan(result)` | 实验设计建议：频率分离、调制周期、采样率、数据质量 |
| `stressTest(time, values, baseline)` | 反事实压力测试 |

内部关键函数：

- `fft` / `inverseFft` / `analyticSignal`
- `fitAtFrequencies` / `fitThreeBasis` / `solveLinear`
- `goldenMinimum` / `optimizeFrequencies`
- `fitCandidate` / `fitAmCandidate` / `fitFmCandidate`
- `computeComplexSpectrum` / `fitComplexAtFrequency`
- `residualStatistics` / `inverseMatrix` / `coefficientCovariance` / `amplitudePhaseSigma` / `modulationIndexSigma`

实数模型：

```text
y(t) = c + Σ Aᵢ sin(2πfᵢ(t-t₀)+φᵢ)
```

AM 候选：解析信号包络 + 载波约束拟合。  
FM 候选：瞬时频率拟合 + 载频/频偏/调制相位局部精化。  
IQ：`z(t)=c+(u+jv)e^{j2πft}`，同时拟合 I/Q。

模型选择：

- 单频/双频/三频阶梯升级：只有 BIC 和 RSS 显著改善才升级；
- AM/FM 需通过调制指数/显著度门控，并优于最佳音调模型；
- 残差都接近数值精度时优先参数更少的模型；
- unknown 条件：无峰、主峰显著度 <6、R² <0.5。

### 5.2 `site/dist/csv.js`

| 函数 | 作用 |
|---|---|
| `parseDelimited(text, delimiter)` | 支持引号、转义引号、引号内换行、CRLF |
| `rowNotEmpty(rows, columnIndex)` | 列非空检查 |
| `parseCsv(text)` | 自动识别 `,` `\t` `;`，返回 headers/rows/numericColumns/timeCandidate/signalCandidate |

### 5.3 `site/dist/mat.js`

| 函数 | 作用 |
|---|---|
| `parseMat(buffer)` | MAT v5 解析，返回 `{name, rows, cols, values, imaginary, complex, storageClass}` |

支持数值类型：double/single/int8/uint8/int16/uint16/int32/uint32/int64/uint64；支持 small data element；支持大小端；压缩 MAT 会拒绝。

### 5.4 `site/dist/app.js` 主要函数

| 函数 | 作用 |
|---|---|
| `buildExample(kind)` | 内置单频/双频/噪声样例 |
| `renderCsvPreview(parsed, filename)` | 前 3 行预览 |
| `matToParsed(variable, sampleRate)` | MAT 变量转统一映射结构 |
| `populateMapping(parsed, filename)` | 填充时间/信号/Q 下拉，自动识别 IQ |
| `selectedSignal()` | 返回 real 或 iq 数据对象 |
| `signalColumns()` / `updateChannelCard()` | 多通道列与批量卡 |
| `analyzeAllChannels()` | 逐通道串行分析 |
| `getAnalyzerWorker()` / `analyzeInWorker()` | Worker 创建、消息、超时、pending 表 |
| `analyzeSignalSafely()` / `analyzeIqSafely()` / `stressTestSafely()` | Worker 优先 + 主线程回退 |
| `invalidateResult()` / `markDataChanged()` | 结果过期、AI/导出/压力禁用 |
| `analyzeCurrent()` | 统一分析入口，版本校验 |
| `render(result)` | 主渲染入口 |
| `renderConclusion()` / `focusEvidence()` | 结论卡与证据链高亮 |
| `renderHealth()` | 数据体检 + 实验设计 |
| `renderModulation()` / `drawModulationChart()` | AM/FM 解构 |
| `renderStress()` / `runStressTest()` | 压力测试 |
| `renderCandidates()` / `renderParameters()` / `renderEvidence()` | 候选、参数、证据 |
| `renderLocalExplanation()` / `renderQwenExplanation()` | 确定性/Qwen 解释 |
| `requestQwenExplanation()` | 缓存、请求、错误、竞态保护 |
| `downloadReport()` | JSON 报告 |
| `bindEvents()` / `init()` | 事件绑定与初始化 |

---

## 6. 接口

### 6.1 输入接口

**实数 CSV / 多通道 CSV**

- 表头 + 至少两行数据；
- 时间列严格递增；
- 近似均匀采样，抖动 ≤5%；
- 64–500,000 样本；
- 文件 ≤10 MiB；
- 分隔符 `,`、`\t`、`;`；
- UTF-8/BOM；
- 引号内换行支持；
- 多通道：除时间列外的多个数值列。

**IQ CSV**

- 时间 + I + Q 三列；
- 表头以 `I` / `Q` 开头时自动识别，或手动勾选 IQ 模式；
- 三列必须互不相同；
- 当前仅单分量复指数。

**MAT v5**

- 实数数值矩阵；
- 1 列：使用 `mat-rate` 生成时间；
- ≥2 列：第一列视为时间，其余为信号/多通道；
- 复数、压缩、v7.3/HDF5 拒绝。

### 6.2 分析结果对象

```js
{
  kind: "real" | "iq",
  createdAt,
  sampleCount,
  sampleRate,
  duration,
  nyquist,
  spectrum: { frequencies, amplitudes, peaks, medianAmplitude, binWidth, nfft },
  health: { status: "ok"|"warn"|"fail", checks, limitations },
  candidates: [{
    id, family: "tone"|"am"|"fm"|"iq", label, count,
    frequencies, parameters, metrics, residualAnalysis,
    modulationEvidence?, modulationView?
  }],
  best: candidate | null,
  unknown,
  recommendedId,
  reliability: {
    level, label, evidence: [{id,label,value,detail,status}],
    limitations, nextSteps, bicGap
  },
  series: { time, observed, fitted, residual },
  iq?: { q, fittedQ, residualQ },
  elapsedMs?, engine?: "worker"|"main"
}
```

参数对象：

```js
{ id, label, value, unit, reference?, sigma?, sigmaKind?: "resolution"|"standard" }
```

### 6.3 Worker 协议

请求：

```js
{
  id: number,
  type: "analyze" | "iq" | "stress",
  time: number[],
  values: number[],       // analyze: signal; iq: I
  qValues?: number[],     // iq only
  baseline?: { model: string } // stress only
}
```

响应：

```js
{ id, ok: true, result: object }
{ id, ok: false, error: string }
```

### 6.4 HTTP Function 接口

`GET /functions/v1/app/health`

```json
{ "ok": true, "configured": true, "provider": "dashscope-compatible" }
```

`POST /functions/v1/app/explain`

请求由 `buildAiPayload` 生成，服务端会重建/裁剪，不直接信任原始字段：

```js
{
  unknown,
  recommendedModel,
  sampleCount,
  sampleRate,
  duration,
  candidates: [{
    model, r2, rmse, bic,
    parameters: [{ name, value, unit, uncertainty, uncertaintyKind }]
  }],
  reliability: {
    level, evidence: [{ label, value, detail, status }], limitations
  }
}
```

模型选择：前端额外携带可选 `model` 字段；服务端按白名单 `qwen-plus / qwen-max / qwen-turbo / qwen-long` 校验，非法或缺省回退到 `QWEN_MODEL` 环境变量或 `qwen-plus`。模型名不参与证据 payload 重建，API Key 仅服务端读取。

成功响应：

```js
{
  ok: true,
  explanation: { summary, observations: string[], limitations: string[] },
  provider: "dashscope-compatible",
  model: "qwen-plus",
  note: "Explanation only; numerical results were not modified."
}
```

错误码：

- `invalid_payload` / `invalid_json` / `payload_too_large`
- `service_not_configured`
- `upstream_error` / `upstream_unavailable` / `invalid_upstream_response`
- `invalid_model_output`
- `rate_limited`

限制：body ≤64 KiB；每分钟/IP 默认 60 次；上游 25 秒超时；前端 30 秒超时。

### 6.5 Qoder Sites 发布接口

- 静态站点：`site/dist/`
- Function：`site/functions/`
- 发布描述：`site/.SignalInsight.qoder.site`
- 发布使用 Qoder CN 桌面端 Sites MCP，不使用 CN CLI `prepare_site`。

---

## 7. 当前已有功能

### 输入与解析

- 内置单频/双频/库外噪声
- CSV 逗号/制表符/分号、BOM、引号换行
- 时间/信号列映射、前 3 行预览
- 多通道逐通道分析
- MAT v5 实数矩阵
- IQ CSV（时间 + I + Q，单分量）

### 模型与可信度

- 单频、2 频、3 频音调模型
- AM、FM 调制候选
- IQ 单分量复指数
- 模型阶梯选择、BIC/RSS 门控、数值精度平局规则
- unknown / insufficient_evidence 拒绝结论
- 参数不确定度（近似标准误 + 1/T 分辨率）
- 可信度证据与限制
- 数据体检（削顶/漂移/跳变/平稳性/阶梯/Nyquist/周期）
- 实验设计建议
- 结论卡与可点击证据链
- AM/FM 调制解构（包络/瞬时频率/边带）
- 反事实压力测试

### AI 与输出

- Qwen 解释、确定性降级、限制展示、错误细分
- AI 结果会话缓存
- 每分钟/IP 软限流
- JSON 报告导出（含健康、实验设计、调制信息、候选、可靠性）

### 工程

- DSP Web Worker、90 秒超时、主线程回退
- 结果版本/竞态保护
- Worker 返回摘要，避免大数组复制
- 响应式布局、aria-live 结果播报
- Node 测试：DSP/CSV/Extreme/MAT/IQ/Function/Fixtures/Static/AI-Consistency
- 零依赖 CDP 浏览器 E2E（`e2e.mjs`，复用 fixtures，需 Chrome/Edge）
- 本地分析历史（localStorage 只读快照，仅存摘要，≤20 条）

---

## 8. 尚未开发 / 明确边界

当前不能宣称支持：

- IQ 多分量、IQ 调制（AM/FM）或 IQ 压力测试
- MAT v7.3/HDF5、压缩 MAT、复数 MAT
- 非均匀采样
- 多通道联合模型（当前逐通道独立）
- 本地历史、用户系统、共享报告、持久化
- AM/FM 物理机制验证（仅拟合候选）
- 严格置信区间（当前为近似标准误/分辨率）
- 程序化 AI 数字一致性审计（目前靠提示词和“只解释证据”约束）
- 真实测量数据 fixtures（当前 fixtures 均为明确标注的仿真数据；浏览器 E2E 已具备 `e2e.mjs`）
- 全局限流（当前为单 Function isolate 内存软限流）

其他边界：

- 压力测试只支持 ≤50,000 点；
- 50 万点浏览器约 30 秒，但 Worker 保持 UI 响应；
- CSV/MAT 解析在主线程；CSV 已修复 O(n²)，但超大文件仍可能短暂阻塞；
- `app.js` / `dsp.js` 较大，已有零依赖静态检查（`static.test.mjs`），但仍无静态类型检查或构建步骤；
- 本地分析历史仅存摘要快照（localStorage ≤20 条），只读、不含原始序列、不覆盖当前结果；
- `main` 未合并当前分支，远端未配置。

---

## 9. 发布流程（重要）

### 9.1 当前环境

- Qoder CN 账号：`mathcrazy`
- 公开站点、Project ID、Site ID 见第 2 节
- Secret：`DASHSCOPE_API_KEY` 已在 Qoder CN 桌面端环境变量/Secrets 中配置
- Secret 值不会返回，也不应写入聊天或源码

### 9.2 为什么不用 CN CLI 发布

CN CLI 1.1.89 只接受旧版扁平 `.qoder.site` 描述文件；本项目当前描述文件是桌面端格式。使用 CN CLI 的 `get_context` / `prepare_site` 可能报：

- `sites_document_invalid`
- `sites_invalid_request`

**发布统一使用 Qoder CN 桌面端 Sites 面板 / Sites MCP。**

### 9.3 发布步骤

1. `get_context` 确认站点可用。
2. 生成新的 action UUID（不要复用旧 action）。
3. `prepare_site`：
   - `projectRoot = "F:/SignalInsight/site"`
   - `webDirectory = "dist"`
   - `functionDirectory = "functions"`
   - `projectId = "01a1e4bb-ea05-7036-8eea-6bdc90a0ab26"`
   - `secretNames = ["DASHSCOPE_API_KEY"]`
4. `get_publish_status` 等待 `artifactReady` / `dependenciesReady` / `canPublish`，`blockers` 为空。
5. `publish_site`。
6. `get_publish_status` 确认 `publication_completed` 且 `published:true`。
7. 验证：
   - `GET /functions/v1/app/health` 返回 `configured:true`
   - 单频/双频/噪声/CSV/AM/IQ/MAT/多通道/AI/导出
   - 浏览器控制台无 error
8. `show_publish_confirmation` 同步桌面端描述文件，并记录新的 action。

发布后 `site/.SignalInsight.qoder.site` 会更新；它可以提交到 Git，但不要手写字段。

---

## 10. 本地运行与测试

```bash
node site/test/dsp.test.mjs
node site/test/csv.test.mjs
node site/test/extreme.test.mjs
node site/test/mat.test.mjs
node site/test/iq.test.mjs
node site/test/function.test.mjs
node site/test/fixtures.test.mjs
node site/test/static.test.mjs
node site/test/ai-consistency.test.mjs
node site/test/contract.test.mjs
node site/test/learn.test.mjs
node site/test/generator.test.mjs
node site/test/e2e.mjs

python -m http.server 4173 --bind 127.0.0.1 --directory site/dist
```

本地静态服务器没有 Function：

- `/functions/v1/app/health` 会 404；
- 页面会显示“AI 服务不可达”，这是预期行为；
- 要验证 Qwen，请使用公开地址，或配置本地代理。

模块缓存注意事项：

- 当前所有模块/资源统一 `?v=13`；
- 修改任何前端文件后，递增全部版本标签（`index.html` 2 处、`app.js` 4 处、Worker 1 处）保持一致；
- `node site/test/static.test.mjs` 校验版本一致性、导入导出与引用存在，防止回退路径复用旧缓存。

---

## 11. 新对话建议遵循的顺序

1. 读本文件、`AGENTS.md`、`README.md`、`HANDOFF.md`。
2. 运行第 0 节 Git 命令，确认分支干净。
3. 针对用户指定任务新建分支，不直接修改 `main`。
4. 修改后先跑相关 Node 测试，再用本地页面验证 UI。
5. 涉及 Function 时跑 `function.test.mjs`。
6. 涉及 Worker/DSP 时递增版本号。
7. 发布前确认 Secret、action、projectId 和描述文件。
8. 发布后做线上回归并更新 `HANDOFF.md` / 本文件。

---

## 12. 当前不应做的事

- 不要恢复已删除的 Python/FastAPI 后端。
- 不要把 AM/FM 候选描述成物理调制机制的唯一证明。
- 不要声称 IQ 支持多分量/复数调制，或 MAT 支持 v7.3/HDF5。
- 不要把多通道说成联合通道模型。
- 不要把参数不确定度说成严格置信区间。
- 不要在公开仓库、聊天或命令行参数中放 Key。
- 不要手改 `site/.SignalInsight.qoder.site`。
- 不要强推、重写历史或删除未知工作。
