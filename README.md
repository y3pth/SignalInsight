# SignalInsight

通信与信号处理实验的浏览器端模型辨识、参数估计、多模型比较与可信度分析平台。

当前唯一交付物是 Qoder Sites 公开提交版。

- **公开站点：** <https://signal-insight-s31b5iv5ld0.qoder.zone>
- **当前状态：** 已公开发布；单频/双频/unknown/CSV/AI/报告导出可用
- **AI：** Qwen 已配置并在线可用；限制展示/超时/错误提示已发布；AI 结果缓存与软限流已启用
- **分析：** DSP 在 Web Worker 中运行；支持单频、多频、AM/FM 候选与参数不确定度
- **立项背景：** [立项确定书.md](立项确定书.md)
- **新对话交接：** [HANDOFF.md](HANDOFF.md)
- **协作规则：** [AGENTS.md](AGENTS.md)

## 结构

```text
site/dist/       线上静态前端与浏览器数值算法
site/functions/  Qoder Sites Deno Function（Qwen 解释代理）
site/test/       部署代码回归测试
site/.SignalInsight.qoder.site  发布描述，不要手改
```

Python FastAPI 后端、旧契约、fixtures 和旧设计文档已从当前工作区移除；Git 历史仍保留。

## 验证

```bash
node site/test/dsp.test.mjs
node site/test/csv.test.mjs
node site/test/extreme.test.mjs
node site/test/function.test.mjs
python -m http.server 4173 --bind 127.0.0.1 --directory site/dist
```

线上验证基线：

- 单频 93.7002 Hz
- 双频 80.50 / 173.20 Hz
- 纯噪声 unknown
- CSV 50 Hz 测试数据 50.0000 Hz
- AM 合成信号 5 Hz / 0.60
- FM 合成信号 4 Hz / β≈2.00
- Qwen 解释对单频/双频/噪声/CSV 均可用
- 报告导出包含候选模型、可靠性和方法边界

## 边界

- 只支持实数、单通道、近似均匀采样 CSV。
- 包含单频、多频、AM/FM 候选；不包含 MAT、复数 IQ、非均匀采样或多通道分析。
- 参数不确定度为线性拟合近似，频率行是 1/T 分辨率，不是严格置信区间。
- 50 万点属于极端输入，浏览器 Worker 约 30 秒；正常样本约 1–2 秒。
- 不保证获奖；正式赛事规则仍待核验。
- API Key 只通过 Qoder Sites Secrets 配置，不进入源码或聊天。
- 发布使用 Qoder CN 桌面端 Sites 面板/MCP；不要用 CN CLI 直接 `prepare_site`。
