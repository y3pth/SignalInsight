# 前端代办清单（学习模式 UI）

> 背景：分析页 UI 重设计已集成到 `site/dist/`（`frontend/ui-redesign` 分支，基于 `integration`，?v=15），
> 经 static + 11 后端测试 + E2E 14 场景验证全绿。**分析态后端功能已全部在 UI 体现**。
> 本清单列出**尚未在 UI 体现的后端能力**——均为学习模式。规格详见 `FRONTEND.md` §15、契约 `CONTRACT.md` §8/§9。
> 后端模块已就绪（DOM-free，只读消费）：`learn.js` / `generator.js` / `service.js`。

## 已确认在 UI 中体现（无需再做）
分析页：输入/映射、结论卡+证据链（focusEvidence）、指标、三图表、候选竞争、参数+不确定度、
数据体检（health-list）、实验设计（design-list）、调制解构（modulation-sidebands）、压力测试（stress-list）、
可信度证据+边界+下一步（next-step-list）、多通道、IQ、MAT、AI 解释、模型选择（model-select）、
本地历史（history-list/renderHistoryDetail）、报告导出、aria-live（result-announcer）。

## 代办（按优先级）

### P1 — 学习页骨架 learn.html（M3）
- [ ] 新建 `site/dist/learn.html` + 学习渲染模块（如 `learn-app.js`），import 带 `?v=15`。
- [ ] 场景目录：`learn.js` `listScenarios()`（15 场景）渲染卡片（title/category/difficulty/summary）。
- [ ] 场景学习视图四步引导：`steps`=observe→hypothesize→verify→conclude，逐步揭示、可回看。
  - observe：`generateScenarioSignal(id)` 画时域/频谱（复用 drawPlot 或样例 result.series）。
  - hypothesize：原理卡 `principle.concept`+`points`，`evidenceIds` 可点击高亮证据。
  - verify：`analyzeScenario(id).result` 复用分析页渲染规则 + `groundTruth` 真值对照 + `match.ok` 反馈。
  - conclude：推荐模型/可信度 + `diagnosis`（缺陷场景）+ `questions` 思考题。
- [ ] 学习进度 localStorage（如 `signalinsight.learn.v1`），目录显示已学徽标。
- [ ] 与分析页 `index.html` 导航互通。
- 规格：FRONTEND.md §15.6–15.10；样例 `site/test/fixtures/sample-scenario-*.json`。

### P2 — 随机实验沙盒（generator）
- [ ] 条件选择器：`generator.js` `CONDITION_CATALOG`（29 条件）+ "随机生成"（condition:"random"）+ seed 输入（可复现）。
- [ ] `runExperiment({condition,seed})` → 展示 `data` 波形/频谱 + `result` 分析 + `groundTruth` 真值对照 + `conditions` 条件标签 + `outcome.notes` 数据驱动结论。
- [ ] 重点教学呈现：`aliasing-warning`（真频 vs 混叠假频）、`input-rejected`（边界拒绝原因）、`unreliable-defect`（体检诊断）。
- [ ] 大样本（>5万）改用 `service.analyzeSignalSafely(data.time,data.values)` Worker 路径。
- 规格：FRONTEND.md §15.16；契约 §9。

### P3 — M2 Qwen 原理自然语言展开
- [ ] 学习页/沙盒接入 `service.fetchLearnExplanation(payload, model, signal)`（`/functions/v1/app/learn-explain`）。
- [ ] payload 来源：学习场景用 `learn.buildLearnPayload(scenario,result)`；实验用 `generator.buildExperimentPayload(experiment)`。
- [ ] 渲染 `explanation.{summary,observations,limitations}` 到原理卡。
- [ ] **本地无 Function 必须降级**到结构化 `principle.points` / `outcome.notes`，不阻塞。
- [ ] 模型选择复用 `#model-select`（白名单 qwen-plus/max/turbo/long）。
- 规格：FRONTEND.md §15.15；契约 §4/§8/§9。

### P4 — 质量与验收
- [ ] 学习页 E2E（`learn-e2e.mjs` 或扩展 `e2e.mjs`）：目录→四步→result→match→进度持久化→沙盒结论→M2 降级。
- [ ] 响应式（窄视口无溢出）、可访问性（aria-live/label）、控制台无错误。
- [ ] 不改后端文件（learn.js/generator.js/service.js/dsp.js/functions）；?v= 集成期由后端统一。
- [ ] 合并入 `integration` 前双方门禁绿（后端 12 测试 / 前端 E2E）。

## 验收标准（DoD）
1. learn.html 列出 15 场景（不硬编码内容），四步引导可推进/回看。
2. 原理卡/诊断/思考题按 schema 渲染；verify 复用分析渲染规则（unknown 拒绝结论/徽章/体检）。
3. 沙盒 29 条件可选可随机，结论数据驱动、含真值对照与混叠/边界揭示。
4. M2 在线展开可用、本地降级可用。
5. 进度持久化；导航互通；窄视口无溢出；控制台清洁。
6. 学习页 E2E 绿；不越界改后端。

## 协作提醒
- 基于 `integration` 开 `frontend/learn-page` 分支；频繁 `git merge integration` 同步。
- 需后端加场景/条件/字段 → 写 `HANDOFF.md` 协作日志提案（后端加法演进）。
- 发布需用户确认（桌面 Sites MCP）；当前线上仍为旧版。