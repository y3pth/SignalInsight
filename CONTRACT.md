# SignalInsight 前后端接口契约

> 契约版本：**1.0**（冻结基线）
> 维护方：后端（数值/逻辑）。前端按本契约消费数据，不依赖后端实现细节。
> 本文件是接口的唯一规范来源；与代码冲突时以代码为准并立即修订本文件。
> 配套流程见 `COLLABORATION.md`。

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
- `kind` 实数为 `"real"`、IQ 为 `"iq"`（v=8 起实数也带 kind）。

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

## 5. service.js API（拆分目标，后端拥有，前端调用）

> 拆分实施后生效。均为纯逻辑、返回数据、不访问 DOM。

```js
analyzeSignalSafely(time, values) -> Promise<Result>     // Worker 优先 + 主线程回退
analyzeIqSafely(time, i, q)       -> Promise<Result>
stressTestSafely(time, values, baseline) -> Promise<StressResult>
checkAiHealth()                   -> Promise<{ configured, provider, reachable }>
requestExplanation(payload, model, { signal }) -> Promise<Explanation>  // 含错误细分
buildReport(result, sourceLabel)  -> ReportObject        // 纯对象，前端负责下载
getHistory()                      -> HistoryEntry[]      // localStorage 读取/校验
addHistory(result, sourceLabel)   -> HistoryEntry[]      // 摘要快照，≤20 条
clearHistory()                    -> void
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

## Changelog

- 1.0（2026-11-17）：冻结当前结果/压力/Worker/Function 形状；定义 service.js 拆分目标 API。