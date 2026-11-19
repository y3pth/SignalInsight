# SignalInsight 后端接口规范表

> 版本：v=15 · 契约 v1.0 · 更新 2026-11-17
> 后端 = DOM-free 纯逻辑模块。本表给出每个接口的签名、参数、返回、错误与约束。
> 数据形状详见 `DATA-FORMATS.md`；契约总则见 `CONTRACT.md`。
> 模块：`dsp.js`（数值内核）/ `service.js`（编排）/ `learn.js`（学习库）/ `analyzer-worker.js`（Worker）/ `functions/*`（Edge Function）。

---

## 1. dsp.js — 数值内核

### 分析主接口
| 接口 | 签名 | 返回 | 错误/约束 |
|---|---|---|---|
| analyzeSignal | `(time:number[], values:number[])` | `Result`（同步） | validateSignal 抛错：样本<64 或 >500000、时间非严格递增、抖动>5%、NaN/Infinity |
| analyzeIqSignal | `(time:number[], i:number[], q:number[])` | `Result`（kind="iq"，含 iq） | 同上；三列等长 |
| stressTest | `(time, values, baseline:{model:string})` | `StressResult` | 仅实数、≤50000 样本；4 扰动变体 |

**Result/Candidate/Metrics/ResidualAnalysis/Spectrum/Health/Reliability/ModulationView/Series** 形状见 DATA-FORMATS §1–§8。

### 投影/解释接口（纯函数，不改 result）
| 接口 | 签名 | 返回 |
|---|---|---|
| buildAiPayload | `(result:Result)` | `AiPayload`（DATA-FORMATS §10） |
| buildDecision | `(result:Result)` | `{title,confidence,summary,evidenceIds:string[],whatWouldChange:string[],alternatives}` |
| buildExperimentPlan | `(result:Result)` | `{items:[{id,label,...}]}`（采样率/时长/调制周期建议） |
| templateExplanation | `(result:Result)` | `{summary,observations:string[],limitations:string[]}`（无 AI 降级） |

### 工具接口
| 接口 | 签名 | 返回 |
|---|---|---|
| validateSignal | `(time, values)` | `{dt,sampleRate,duration}`；非法抛错 |
| computeSpectrum | `(values, sampleRate)` | `Spectrum`（去均值+Hann+radix-2 FFT） |
| inspectData | `(time, values, sampleRate, duration, spectrum)` | `Health` |
| autocorrelation | `(values, lag)` | `number` |
| mean / rms | `(values:number[])` | `number` |
| nextPowerOfTwo | `(value:number)` | `number` |

**模型选择规则**：单频保守基线；多频需 BIC 改善≥10 且 RSS 降≥10%；AM/FM 需调制门控且优于音调；数值精度平局优先少参数。unknown 条件：无显著峰 / 主峰显著度<6 / 最佳 R²<0.5。

---

## 2. service.js — 编排（前端主调用入口）

| 接口 | 签名 | 返回 | 说明 |
|---|---|---|---|
| analyzeSignalSafely | `(time, values)` | `Promise<Result>` | Worker 优先，失败回退主线程；超时(90s)抛 AnalyzerTimeoutError；result.engine 标注 |
| analyzeIqSafely | `(time, i, q)` | `Promise<Result>` | 同上，IQ |
| stressTestSafely | `(time, values, baseline)` | `Promise<StressResult>` | 同上 |
| fetchAiHealth | `()` | `Promise<{configured:boolean, health:"configured"\|"not_configured"\|"unreachable", provider}>` | GET /health，8s 超时 |
| fetchExplanation | `(payload:AiPayload, model:string, signal:AbortSignal)` | `Promise<Explanation>` | POST /explain；失败抛 Error（AI_ERROR_MESSAGES 细分）；30s 超时由调用方 signal |
| fetchLearnExplanation | `(payload:LearnPayload, model, signal)` | `Promise<Explanation>` | POST /learn-explain（M2） |
| buildReport | `(result:Result, sourceLabel:string)` | `ReportObject` | 纯对象，前端负责下载 |
| getHistory | `()` | `HistoryEntry[]` | localStorage 读取+校验，≤20 |
| addHistory | `(result, sourceLabel)` | `{entries:HistoryEntry[], persisted:boolean}` | 摘要快照，配额失败 persisted=false |
| clearHistoryStorage | `()` | `{persisted:boolean}` | 清空存储 |
| AI_ERROR_MESSAGES | const | `{错误码:中文提示}` | 错误细分映射 |

**模型白名单**：qwen-plus / qwen-max / qwen-turbo / qwen-long（服务端校验，非法回退 env/default）。

---

## 3. learn.js — 学习库（15 场景）

| 接口 | 签名 | 返回 |
|---|---|---|
| listScenarios | `()` | `ScenarioMeta[]`（15） |
| getScenario | `(id:string)` | `Scenario \| null` |
| generateScenarioSignal | `(id:string)` | `{kind,time,values}\|{kind,time,i,q}`；未知 id 抛错 |
| analyzeScenario | `(id:string)` | `{scenario,result:Result,match:{ok,checks}}` |
| buildLearnPayload | `(scenario:Scenario, result:Result\|null)` | `LearnPayload`（供 /learn-explain） |

场景含 principle/diagnosis/questions/steps/expected；形状见 DATA-FORMATS §9。

---

## 4. analyzer-worker.js — Worker 协议

```js
// 请求（service → worker）
{ id:number, type:"analyze"|"iq"|"stress", time:number[], values:number[], qValues?:number[], baseline?:{model} }
// 响应（worker → service）
{ id, ok:true, result:Result|StressResult } | { id, ok:false, error:string }
```
- service 维护 pending 表按 id 匹配；90s 超时终止 worker 并拒绝所有 pending；error 事件回退主线程。
- worker 内 import dsp.js（同版本）；返回候选摘要（无 fitted/residual 大数组），仅最佳模型带 series。

---

## 5. Edge Function HTTP（functions/handler.ts）

### GET /functions/v1/app/health
- 响应 200：`{ ok:true, configured:boolean, provider:"dashscope-compatible" }`
- 非 GET → 405 method_not_allowed。configured = 是否配置 DASHSCOPE_API_KEY。

### POST /functions/v1/app/explain
- 请求体：`AiPayload` + 可选 `model`（≤64 KiB）。
- 服务端 `validatePayload` 白名单重建（不信任原始字段）：unknown 布尔、sampleCount 整数 64–500000、sampleRate>0、candidates≤6、parameters≤20、reliability.level 枚举、evidence≤10。
- 成功 200：`Explanation`（DATA-FORMATS §10）。
- Qwen：temperature 0.5、max_tokens 1200、上游 25s 超时。

### POST /functions/v1/app/learn-explain（M2）
- 请求体：`LearnPayload` + 可选 `model`。
- `validateLearnPayload` 白名单重建：scenarioId/concept 必填，points≤12、evidence≤12、diagnosis 裁剪、groundTruth 裁剪。
- 成功 200：`Explanation`；提示词为教学展开（仍只解释不改数值）。

### 错误码（两解释端点通用）
| HTTP | error | 触发 |
|---|---|---|
| 400 | invalid_json | JSON 解析失败 |
| 400 | invalid_payload | 白名单校验失败 |
| 400 | invalid_body | 读取 body 失败 |
| 405 | method_not_allowed | 方法错误 |
| 404 | not_found | 路径错误 |
| 413 | payload_too_large | body>64 KiB |
| 429 | rate_limited | >60 次/分/IP（软，RATE_LIMIT_MAX 可调） |
| 502 | upstream_error | Qwen 非 2xx |
| 502 | invalid_upstream_response | Qwen 响应非 JSON/无 content |
| 502 | invalid_model_output | Qwen 输出非合规 JSON |
| 503 | service_not_configured | 未配置 Key |
| 503 | upstream_unavailable | 上游网络/超时 |

---

## 6. 全局不变量与约束
1. **AI 只解释**：Explanation 纯文本，绝不回写数值/可信等级；Key 仅服务端，不进前端/响应/日志。
2. **后端 DOM-free**：dsp/service/learn/worker 不访问 document；UI 全在前端 app.js。
3. **加法演进**：新增可选字段/函数不破坏既有契约；破坏性变更升契约版本+双方确认。
4. **版本一致**：所有模块/资源 ?v=N 统一（当前 15），static.test 强制。
5. **输入边界**：64–500000 样本、近似均匀（抖动≤5%）、时间严格递增、有限值；越界拒绝。
6. **unknown 诚实**：证据不足拒绝结论，不强行拟合。
7. **不确定度近似**：sigma 为线性拟合近似标准误；频率行 1/T 分辨率，非严格置信区间。
8. **限流软约束**：单 isolate 内存计数，正常演示不受影响。

---

## 7. 前端调用速查
```js
import { analyzeSignalSafely, analyzeIqSafely, stressTestSafely, fetchAiHealth,
         fetchExplanation, fetchLearnExplanation, buildReport,
         getHistory, addHistory, clearHistoryStorage } from "./service.js?v=12";
import { buildAiPayload, buildDecision, buildExperimentPlan, templateExplanation } from "./dsp.js?v=12";
import { listScenarios, getScenario, analyzeScenario, buildLearnPayload } from "./learn.js?v=12";
```