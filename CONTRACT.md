# SignalInsight 前后端接口契约

> 契约版本：**1.0**（冻结基线）
> 维护方：后端（数值/逻辑）。前端按本契约消费数据，不依赖后端实现细节。
> 本文件是接口的唯一规范来源；与代码冲突时以代码为准并立即修订本文件。
> 配套流程见 `COLLABORATION.md`。数据形状字典见 `DATA-FORMATS.md`；接口签名/端点详见 `BACKEND-API.md`。

---

## 0. 边界总则

- **后端 = 纯逻辑，不访问 DOM**。后端模块（`dsp.js`/`csv.js`/`mat.js`/`analyzer-worker.js`/`functions/*`/拆分后的 `service.js`）只接收数据、返回数据，绝不 `document.*`。
- **前端 = DOM/UI**。`index.html`/`styles.css`/`app.js`（拆分后归前端）负责渲染、事件、UI 状态，调用后端 API 获取数据。
- **加法式演进**：后端可新增可选字段/新函数；不得删除、重命名或改变已有契约字段的类型/语义，除非升契约版本并双方确认。前端必须忽略未知字段。

---

## 1. 分析结果对象（analyzeSignal / analyzeIqSignal 返回）

```js
{
  kind: "real" | "iq",
  createdAt: string,            // ISO
  sampleCount: number,
  sampleRate: number,           // Hz
  duration: number,             // s
  nyquist: number,
  spectrum: { frequencies, amplitudes, peaks, medianAmplitude, binWidth, nfft },
  health: {
    status: "ok" | "warn" | "fail",
    checks: [{ id, label, status: "pass"|"warn"|"fail", detail }],
    limitations: string[]
  },
  candidates: [{
    id, family: "tone"|"am"|"fm"|"iq", label, count,
    frequencies: number[],
    parameters: Parameter[],
    metrics: { r2, rmse, aic, bic, rss },
    residualAnalysis,
    modulationEvidence?,        // AM/FM
    modulationView?             // AM/FM：{ type, carrierFrequency, modulationFrequency, modulationIndex, frequencyDeviation?, sidebands, time, ... }
  }],
  best: Candidate | null,       // 不含 fitted/residual 大数组
  unknown: boolean,
  recommendedId: string | null,
  reliability: {
    level: "reliable"|"caution"|"unreliable"|"insufficient_evidence",
    label: string,
    evidence: [{ id, label, value, detail, status }],
    limitations: string[],
    nextSteps: string[],
    bicGap: number | null
  },
  series: { time, observed, fitted, residual },   // 仅最佳模型序列
  iq?: { q, fittedQ, residualQ },                  // kind==="iq"
  elapsedMs?: number,
  engine?: "worker" | "main"
}
```

`Parameter`：

```js
{ id, label, value: number, unit, reference?, sigma?: number|null, sigmaKind?: "resolution"|"standard" }
```

约定：
- `candidates` 与 `best` **不含** `fitted`/`residual` 大数组（只有 `series` 携带最佳序列）。
- `unknown===true` 时 `recommendedId===null`，前端不得展示参数结论。
- `kind` 实数为 `"real"`、IQ 为 `"iq"`（实数与 IQ 均带 kind）。

## 2. 压力测试结果（stressTest 返回）

```js
{ total: number, summary: string, variants: [{ name, recommendedModel, reliability, r2, health, flipped }] }
```

仅实数、样本 ≤ 50,000。

## 3. Worker 协议（后端内部，前端不直接调用）

请求：`{ id, type: "analyze"|"iq"|"stress", time, values, qValues?, baseline? }`
响应：`{ id, ok: true, result }` 或 `{ id, ok: false, error }`

## 4. Edge Function HTTP（后端拥有）

`GET /functions/v1/app/health` → `{ ok, configured, provider }`

`POST /functions/v1/app/explain`
- 请求：`buildAiPayload(result)` 的结构化摘要 + 可选 `model` 字段。
- `model` 服务端白名单：`qwen-plus / qwen-max / qwen-turbo / qwen-long`；非法/缺省回退 `QWEN_MODEL` 或 `qwen-plus`。
- 成功：`{ ok:true, explanation:{ summary, observations:string[], limitations:string[] }, provider, model, note }`
- 错误码：`invalid_payload / invalid_json / payload_too_large / service_not_configured / upstream_error / upstream_unavailable / invalid_upstream_response / invalid_model_output / rate_limited`
- 限制：body ≤ 64 KiB；60 次/分/IP（软）；上游 25s；前端 30s。
- **不变量**：AI 只返回文本解释，绝不修改数值；API Key 仅服务端，不进响应/日志/前端。

`buildAiPayload(result)`（dsp.js 导出，纯投影）：

```js
{ unknown, recommendedModel, sampleCount, sampleRate, duration,
  candidates: [{ model, r2, rmse, bic, parameters: [{ name, value, unit, uncertainty, uncertaintyKind }] }],
  reliability: { level, evidence: [{ label, value, detail, status }], limitations } }
```

`POST /functions/v1/app/learn-explain`（M2 学习原理展开）
- 请求：`buildLearnPayload(scenario, result)` + 可选 `model`（同白名单）。
- 成功：同 `/explain` 的 `{ ok, explanation:{summary,observations,limitations}, provider, model, note }`。
- 校验：`validateLearnPayload` 白名单重建（`scenarioId`/`concept` 必填，points/evidence/diagnosis/groundTruth 裁剪），错误码同 `/explain`。
- 不变量同 `/explain`：文本-only、不改数值、Key 仅服务端、共享限流。

## 5. service.js API（已实施，后端拥有，前端调用）

> 纯逻辑、返回数据、不访问 DOM（仅用 fetch / Worker / localStorage）。

```js
analyzeSignalSafely(time, values) -> Promise<Result>     // Worker 优先 + 主线程回退
analyzeIqSafely(time, i, q)       -> Promise<Result>
stressTestSafely(time, values, baseline) -> Promise<StressResult>
fetchAiHealth()                   -> Promise<{ configured, health, provider }>
fetchExplanation(payload, model, signal) -> Promise<Explanation>  // 失败抛 Error（AI_ERROR_MESSAGES 细分）
fetchLearnExplanation(payload, model, signal) -> Promise<Explanation>  // /learn-explain，M2 原理展开
buildReport(result, sourceLabel)  -> ReportObject        // 纯对象，前端负责下载
getHistory()                      -> HistoryEntry[]      // localStorage 读取/校验
addHistory(result, sourceLabel)   -> { entries: HistoryEntry[], persisted: boolean }
clearHistoryStorage()             -> { persisted: boolean }
AI_ERROR_MESSAGES                 // 错误码 → 中文提示映射
```

`HistoryEntry`：`{ id, createdAt, source, kind, modelLabel, unknown, reliabilityLevel, reliabilityLabel, sampleCount, sampleRate, healthStatus, bicGap, parameters: [{label,value,unit,sigma,sigmaKind}] }`（不含原始序列）。

## 6. 前端自有约定（后端不干涉）

- DOM 元素 id、CSS 类名、页面结构、图表绘制、事件绑定、UI 状态：前端全权。
- 前端通过第 5 节 API 取数据；后端不假设任何 DOM id。
- 缓存版本标签 `?v=N`：见 COLLABORATION.md「版本协调」，集成时由后端统一递增。

## 7. 契约变更流程

1. 后端在 `CONTRACT.md` 顶部 changelog 提案变更 + 升版本号。
2. 通过 `HANDOFF.md` 协作日志通知前端；破坏性变更需前端确认。
3. 后端更新 `contract.test.mjs` 锁定新形状；前端适配。
4. 加法式新增可选字段无需升主版本，但仍记录 changelog。

## 8. 学习库 API（learn.js，后端拥有，前端学习页调用）

> DOM-free。复用 dsp.js 数值内核与种子信号生成。**15 场景（含 IQ）**（clean/modulation/defect/out-of-library）；M2 原理展开见 §4 `/learn-explain`。

```js
listScenarios()            -> ScenarioMeta[]   // {id,title,category,difficulty,summary}
getScenario(id)            -> Scenario | null
generateScenarioSignal(id) -> { kind, time, values, i?, q? }  // 合成仿真信号
analyzeScenario(id)        -> { scenario, result, match }     // result=Result；match={ok,checks[]}
buildLearnPayload(scenario, result) -> LearnPayload           // M2：供 /learn-explain 的结构化投影
```

`Scenario`：

```js
{ id, title, category: "clean"|"modulation"|"defect"|"out-of-library", difficulty, summary,
  signal: { kind, fs, n, seed, components:[{frequency,amplitude,phase}], offset, noiseSigma, clip? },
  groundTruth: {...},
  expected: { unknown?, model?, reliability?, health?, healthChecks? },  // 预期分析结论
  principle: { concept, evidenceIds:[...], points:[...] },               // 结构化原理（绑定证据）
  diagnosis: null | { issues:[...], causes:[...], improvements:[...] },  // 缺陷场景
  questions: [...],                                                       // 思考题
  steps: ["observe","hypothesize","verify","conclude"] }
```

约定：
- `principle.points` 是确定性结构化要点，前端渲染为原理卡；自然语言展开由 Qwen（M2）生成，仍只解释不改数值。
- `analyzeScenario().match.ok` 表示实际分析是否符合预期，供学习页做"对照"反馈。
- 前端学习页（`learn.html`）消费本 API；样例数据见 `site/test/fixtures/sample-scenario-*.json`。
- 加法演进：新增场景/字段不破坏既有 API。

## Changelog

- 1.0（2026-11-17）：冻结当前结果/压力/Worker/Function 形状；定义 service.js 拆分目标 API。
- 1.0（2026-11-17，加法）：新增 learn.js 学习库 API（§8）与场景 schema；M1 场景 clean-single/clipped-tone。
- 1.0（2026-11-17，加法）：学习库扩至 10 场景；M2 新增 `/learn-explain` + `buildLearnPayload` + `fetchLearnExplanation`（文本-only，不改数值）。
- 1.0（2026-11-17，加法）：学习库扩至 15 场景（含 IQ）；新增 generator.js 数据产生器 API（§9，17 条件 + 真值感知结论分类）。
- 1.0（2026-11-17，加法）：generator.js 扩至 29 条件（谐波/脉冲/掉零/近频/过调制/极弱/少周期/恰 Nyquist/工频/时间重复/NaN/超长）。
- 1.0（2026-11-17，加法）：classifyOutcome 解释改为数据驱动自适应；新增 buildExperimentPayload 供 Qwen 展开。
- 1.1（2026-11-18，移除）：删除实验沙盒 generator.js（§9 作废）；信号合成器内联回 learn.js（场景仍 15 个）；模块版本统一 v=12。