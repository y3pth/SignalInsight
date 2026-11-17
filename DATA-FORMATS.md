# SignalInsight 模块间数据传输格式

> 版本：v=15 · 契约 v1.0 · 更新 2026-11-17
> 本文件是**数据形状字典**：模块之间传递的每个对象/数组的字段、类型、含义。
> 接口签名/端点见 `BACKEND-API.md`；契约总则见 `CONTRACT.md`。
> 所有数值由后端（DOM-free）生产，前端只渲染。字段以代码实测为准。

---

## 0. 数据流总览

```
输入(time,values[,i,q])
  → dsp.analyzeSignal / analyzeIqSignal → Result
  → dsp.stressTest → StressResult
  → generator.runExperiment → Experiment{params,groundTruth,conditions,data,result,outcome}
  → learn.analyzeScenario → {scenario,result,match}
  → dsp.buildAiPayload(Result) → AiPayload → handler /explain → Explanation
  → learn.buildLearnPayload / generator.buildExperimentPayload → LearnPayload → /learn-explain → Explanation
  → service.buildReport(Result) → ReportObject
  → service.addHistory(Result) → HistoryEntry
前端 app.js render* 消费上述对象绘图/填表。
```

---

## 1. Result（分析结果，dsp 产出）

| 字段 | 类型 | 说明 |
|---|---|---|
| kind | `"real"`\|`"iq"` | 信号类型 |
| createdAt | string(ISO) | 生成时间 |
| sampleCount | number | 样本数 |
| sampleRate | number | 采样率 Hz |
| duration | number | 观测时长 s |
| nyquist | number | fs/2 |
| spectrum | Spectrum | 见 §3 |
| health | Health | 见 §6 |
| candidates | Candidate[] | 候选模型摘要（无大数组） |
| best | Candidate\|null | 最佳候选 |
| unknown | boolean | 是否拒绝结论 |
| recommendedId | string\|null | 推荐模型 id（unknown 时 null） |
| reliability | Reliability | 见 §7 |
| series | Series | 见 §5（仅最佳模型序列） |
| iq | IQSeries | 仅 kind="iq"，见 §5 |
| elapsedMs | number | 可选，耗时 |
| engine | `"worker"`\|`"main"` | 可选，计算引擎 |

## 2. Candidate / Parameter / Metrics / ResidualAnalysis

**Candidate**
| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | single_tone / multi_tone_2 / multi_tone_3 / am / fm / iq_single |
| family | `"tone"`\|`"am"`\|`"fm"`\|`"iq"` | 模型族 |
| label | string | 中文模型名 |
| count | number | 分量数 |
| frequencies | number[] | 各分量频率 Hz |
| parameters | Parameter[] | 见下 |
| metrics | Metrics | 见下 |
| residualAnalysis | ResidualAnalysis | 见下 |
| modulationEvidence | object | 可选，AM/FM 门控证据 |
| modulationView | ModulationView | 可选，AM/FM，见 §8 |

**Parameter**
```js
{ id: string, label: string, value: number, unit: string,
  reference?: string, sigma?: number|null, sigmaKind?: "resolution"|"standard" }
```
- id：offset / frequency_1 / amplitude_1 / phase_1；IQ 为 offset_i / offset_q / frequency_1 / amplitude_1 / phase_1；AM/FM 另有 modulation_frequency / modulation_index / modulation_phase（FM 含 frequency_deviation）。
- 频率行 sigmaKind="resolution"（1/T 分辨率，非置信区间）。

**Metrics**
```js
{ rss: number, rmse: number, r2: number, aic: number, bic: number,
  sampleCount: number, freeParameters: number }
```

**ResidualAnalysis（残差分析）**
```js
{ rms: number,          // 残差均方根
  lag1: number,         // 滞后 1 自相关
  maxAcf: number,       // 滞后 1–100 最大绝对自相关（白噪声判据）
  frequency: number,    // 残余谱主频 Hz
  prominence: number,   // 残余主峰显著度（×中位数）
  strongestPeak: { frequency: number, amplitude: number, bin: number, prominence: number } }
```

## 3. Spectrum（频谱）
```js
{ frequencies: number[],   // 长度 nfft/2
  amplitudes: number[],    // 同长
  peaks: [{ frequency: number, amplitude: number, bin: number, prominence: number }],
  medianAmplitude: number, // 显著度基线
  binWidth: number,        // Hz
  nfft: number }
```

## 4. Health（数据体检）
```js
{ status: "ok"|"warn"|"fail",
  checks: [{ id: string, label: string, status: "pass"|"warn"|"fail", detail: string }],
  limitations: string[] }
```
check.id ∈ clipping / drift / jump / stationarity / quantization / nyquist / cycles。

## 5. Series / IQSeries（序列，画图源）
```js
Series  = { time: number[], observed: number[], fitted: number[], residual: number[] }  // 等长=sampleCount
IQSeries = { q: number[], fittedQ: number[], residualQ: number[] }  // I 路在 Series.observed/fitted/residual
```

## 6. Reliability / Evidence（可信度）
```js
Reliability = {
  level: "reliable"|"caution"|"unreliable"|"insufficient_evidence",
  label: string, bicGap: number|null,
  evidence: Evidence[], limitations: string[], nextSteps: string[] }
Evidence = { id: string, label: string, value: string, detail: string, status: "pass"|"warn"|"fail" }
```
evidence.id ∈ spectral_prominence / fit_quality / residual_whiteness / residual_structure / frequency_resolution / modulation_structure / data_health。

## 7. ModulationView / Sideband（调制解构，AM/FM）
```js
// AM
{ type:"am", time:number[], primary:number[], fitted:number[],   // primary=包络，≤513 点
  carrierFrequency:number, modulationFrequency:number, modulationIndex:number, carrierAmplitude:number,
  sidebands: Sideband[] }                                        // 3 条
// FM
{ type:"fm", time:number[], primary:number[], fitted:number[],   // primary=瞬时频率
  carrierFrequency:number, modulationFrequency:number, modulationIndex:number, frequencyDeviation:number,
  sidebands: Sideband[] }                                        // 随 β，典型 5 条
Sideband = { frequency:number, amplitude:number }
```

## 8. StressResult / Variant（压力测试）
```js
StressResult = { total: number, summary: string, variants: Variant[] }
Variant = { id:string, label:string, recommendedModel:string, reliability:string, unknown:boolean,
            r2:number, bicGap:number, healthStatus:string, sampleCount:number, sampleRate:number, flipped:boolean }
```
variant.id ∈ noise20 / noise10 / half / downsample2。仅实数、≤50000 样本。

## 9. Generator（数据产生器）

**params（合成参数）**
```js
{ kind?:"real"|"iq", waveform?:"tones"|"am"|"fm"|"chirp"|"drift"|"noise"|"iq",
  fs:number, n:number, seed:number, condition?:string,
  components?:[{frequency,amplitude,phase}], offset?:number, noiseSigma?:number,
  clip?:number, quantizeBits?:number, quantizeRange?:number, driftEnd?:number, jitterPercent?:number,
  carrierFrequency?, carrierAmplitude?, carrierPhase?, modulationFrequency?, modulationIndex?, modulationPhase?,
  amplitude?, phase?, startFrequency?, endFrequency?, iOffset?, qOffset?,
  spikes?:{count,amplitude}, dropout?:{startFraction,endFraction}, nanCount?:number, duplicateTime?:boolean }
```

**Experiment（runExperiment 返回）**
```js
{ params, groundTruth, conditions: string[],
  data: {kind,time,values} | {kind,time,i,q} | null,   // 拒绝时 null
  result: Result | null,
  outcome: Outcome }
```

**groundTruth**：`{ fs, n, nyquist, waveform, kind, frequency?, amplitude?, components?, carrierFrequency?, modulationFrequency?, modulationIndex?, startFrequency?, endFrequency? }`

**Outcome（结论分类）**
```js
{ verdict: "correct-model"|"caution-boundary"|"unreliable-defect"|"unknown-rejected"|"aliasing-warning"|"input-rejected",
  rejected:boolean, unknown:boolean|null, reliability:string|null, model:string|null,
  modelFrequency:number|null, modelAmplitude:number|null, healthIssues:string[],
  aliasing:boolean, frequencyError:number|null, amplitudeError:number|null, r2:number|null, bicGap:number|null,
  notes:string[] }   // 数据驱动解释，随实际数值变化
```

**ScenarioMeta / Scenario（learn.js）**
```js
ScenarioMeta = { id, title, category:"clean"|"modulation"|"defect"|"out-of-library", difficulty:number, summary }
Scenario = ScenarioMeta & { signal:params, groundTruth, expected:{unknown?,model?,reliability?,health?,healthChecks?},
  principle:{concept,evidenceIds:string[],points:string[]},
  diagnosis:null|{issues:string[],causes:string[],improvements:string[]},
  questions:string[], steps:["observe","hypothesize","verify","conclude"] }
// analyzeScenario → { scenario, result:Result, match:{ok:boolean,checks:boolean[]} }
```

## 10. AI 数据

**AiPayload（buildAiPayload(Result)，发 /explain）**
```js
{ unknown:boolean, recommendedModel:string|null, sampleCount:number, sampleRate:number, duration:number|null,
  candidates:[{ model:string, r2:number|null, rmse:number, bic:number,
    parameters:[{ name:string, value:number, unit:string, uncertainty:number|null, uncertaintyKind:string|null }] }],
  reliability:{ level:string, evidence:[{label,value,detail,status}], limitations:string[] } }
```
前端额外附 `model`（白名单 qwen-plus/max/turbo/long）。

**LearnPayload（buildLearnPayload / buildExperimentPayload，发 /learn-explain）**
```js
{ scenarioId:string, title:string, category:string, concept:string, points:string[],
  evidence:[{label,value,detail,status}], recommendedModel:string|null, unknown:boolean|null,
  reliabilityLevel:string|null, healthStatus:string|null,
  diagnosis:null|{issues,causes,improvements}, groundTruth:object|string|null }
```

**Explanation（/explain 与 /learn-explain 返回）**
```js
{ ok:true, explanation:{ summary:string, observations:string[], limitations:string[] },
  provider:"dashscope-compatible", model:string, note:string }
```
**纯文本，绝不回写数值。**

## 11. HistoryEntry / ReportObject（service.js）

**HistoryEntry**
```js
{ id, createdAt, source, kind, modelLabel, unknown, reliabilityLevel, reliabilityLabel,
  sampleCount, sampleRate, healthStatus, bicGap,
  parameters:[{label,value,unit,sigma,sigmaKind}] }   // 摘要，不含原始序列；≤20 条
```

**ReportObject（buildReport）**
```js
{ product:"SignalInsight", version, generatedAt, source, sampleCount, sampleRateHz, durationSeconds,
  kind, recommendedModel, unknown, reliability:Reliability, health:Health, experimentPlan,
  modulation:null|{type,carrierFrequency,modulationFrequency,modulationIndex,frequencyDeviation,sidebands},
  candidates:[{id,label,parameters,metrics,residualAnalysis}],
  method:{spectrum,fitting,selection} }
```

## 12. Worker 协议（service ↔ analyzer-worker）
```js
// 请求
{ id:number, type:"analyze"|"iq"|"stress", time:number[], values:number[], qValues?:number[], baseline?:{model:string} }
// 响应
{ id:number, ok:true, result:Result|StressResult } | { id:number, ok:false, error:string }
```

## 13. HTTP 端点（详见 BACKEND-API.md）
- `GET /functions/v1/app/health` → `{ ok, configured, provider }`
- `POST /functions/v1/app/explain` → Explanation（请求 AiPayload+model）
- `POST /functions/v1/app/learn-explain` → Explanation（请求 LearnPayload+model）
- 错误码：invalid_payload / invalid_json / payload_too_large / service_not_configured / upstream_error / upstream_unavailable / invalid_upstream_response / invalid_model_output / rate_limited / method_not_allowed / not_found / invalid_body