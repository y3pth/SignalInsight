# 前端代办清单（学习模式 UI）

> 背景：分析页 UI 重设计 + 学习页（learn.html/learn-app.js/learn.css/charts.js）已集成到 `site/dist/`（基于 `integration`，?v=12），
> 经 static + 11 后端测试 + E2E 14 场景 + 学习页浏览器实测验证全绿。**分析态后端功能已全部在 UI 体现**。
> **实验沙盒（generator.js）已按需求删除**；信号合成器内联回 learn.js，学习场景仍 15 个。
> 规格详见 `FRONTEND.md` §15、契约 `CONTRACT.md` §8、数据 `DATA-FORMATS.md` §9、接口 `BACKEND-API.md`。
> 后端模块（DOM-free，只读消费）：`learn.js` / `service.js` / `dsp.js`。

## 已完成 ✅
- 分析页重设计（输入/映射、结论卡+证据链、指标、三图表、候选、参数+不确定度、体检、实验设计、调制解构、压力测试、可信度证据、多通道、IQ、MAT、AI、模型选择、本地历史、导出、aria-live）。
- 学习页骨架（P1）：learn.html + learn-app.js，15 场景目录、四步引导（observe→hypothesize→verify→conclude）、原理卡、诊断、思考题、进度、主题切换、与分析页导航。
- M2 接入：learn-app.js 调用 `fetchLearnExplanation(buildLearnPayload(...))`，本地降级到结构化要点。

## 剩余代办（按优先级）

### P1 — 学习页打磨
- [ ] 核对四步引导交互细节（逐步揭示/回看、证据 chips 高亮、真值对照呈现）。
- [ ] 学习进度标记交互确认（结论步手动核对后标记已学；进度 localStorage 持久化）。
- [ ] 学习页与分析页视觉/导航一致性。

### P2 — M2 Qwen 原理展开验证
- [ ] 在线验证 `fetchLearnExplanation`（`/learn-explain`）返回 `{summary,observations,limitations}` 渲染到原理卡。
- [ ] payload 用 `learn.buildLearnPayload(scenario,result)`。
- [ ] **本地无 Function 必须降级**到结构化 `principle.points`，不阻塞。
- [ ] 模型选择复用 `#model-select`（白名单 qwen-plus/max/turbo/long）。
- 规格：FRONTEND.md §15.15；契约 §4/§8。

### P3 — 质量与验收
- [ ] 学习页 E2E（`learn-e2e.mjs` 或扩展 `e2e.mjs`）：目录→四步→result→match→进度持久化→M2 降级。
- [ ] 响应式（窄视口无溢出）、可访问性（aria-live/label）、控制台无错误。
- [ ] 不改后端文件（learn.js/service.js/dsp.js/functions）；?v= 集成期由后端统一。
- [ ] 合并入 `integration` 前双方门禁绿（后端 11 测试 / 前端 E2E）。

## 验收标准（DoD）
1. learn.html 列出 15 场景（不硬编码内容），四步引导可推进/回看。
2. 原理卡/诊断/思考题按 schema 渲染；verify 复用分析渲染规则（unknown 拒绝结论/徽章/体检）。
3. M2 在线展开可用、本地降级可用。
4. 进度持久化；导航互通；窄视口无溢出；控制台清洁。
5. 学习页 E2E 绿；不越界改后端。

## 协作提醒
- 基于 `integration` 开 `frontend/learn-page` 分支；频繁 `git merge integration` 同步。
- 需后端加场景/字段 → 写 `HANDOFF.md` 协作日志提案（后端加法演进）。
- 发布需用户确认（桌面 Sites MCP）；当前线上仍为旧版。