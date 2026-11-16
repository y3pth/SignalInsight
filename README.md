# SignalInsight

通信与信号处理实验的浏览器端模型辨识、参数估计、多模型比较与可信度分析平台。

当前唯一交付物是 Qoder Sites 公开提交版。

- **公开站点：** <https://signal-insight-s31b5iv5ld0.qoder.zone>
- **当前状态：** 公开版可用；信任实验室功能已发布并完成线上回归
- **AI：** Qwen 已配置并在线可用；限制展示/超时/错误提示已发布；AI 结果缓存与软限流已启用
- **分析：** DSP 在 Web Worker 中运行；支持单频、多频、AM/FM 候选与参数不确定度
- **信任实验室：** 结论卡/证据链、数据体检、实验设计建议、AM/FM 解构、反事实压力测试
- **数据模式：** 实数单/多通道 CSV、MAT v5 实数矩阵、IQ CSV（单分量复指数）
- **立项背景：** [立项确定书.md](立项确定书.md)
- **新对话交接：** [HANDOFF.md](HANDOFF.md)
- **工程转接：** [TRANSFER.md](TRANSFER.md)
- **协作规则：** [AGENTS.md](AGENTS.md)

## 结构

```text
site/dist/       线上静态前端与浏览器数值算法
site/functions/  Qoder Sites Deno Function（Qwen 解释代理）
site/test/       部署代码回归测试
site/test/fixtures/  MAT v5 测试夹具
site/.SignalInsight.qoder.site  发布描述，不要手改
```

Python FastAPI 后端、旧契约、旧设计文档已从当前工作区移除；Git 历史仍保留。

## 验证

```bash
node site/test/dsp.test.mjs
node site/test/csv.test.mjs
node site/test/extreme.test.mjs
node site/test/mat.test.mjs
node site/test/iq.test.mjs
node site/test/function.test.mjs
python -m http.server 4173 --bind 127.0.0.1 --directory site/dist
```

验证基线：

- 单频 93.7002 Hz
- 双频 80.50 / 173.20 Hz
- 纯噪声 unknown
- CSV 50 Hz 测试数据 50.0000 Hz
- AM 合成信号 5 Hz / 0.60
- FM 合成信号 4 Hz / β≈2.00
- MAT v5：64×2 时间+信号矩阵正确解析
- IQ：120 Hz / 幅值 2 / 相位 0.3 正确识别；纯噪声 unknown
- 50 万点单频：Node 约 10 秒，浏览器 Worker 约 30 秒
- Qwen 解释对单频/双频/噪声/CSV/AM 可用
- 报告导出包含候选模型、可靠性、健康检查和方法边界

## 边界

- 支持实数单/多通道 CSV、MAT v5 实数矩阵、IQ CSV（时间 + I + Q）。
- 多通道为逐通道独立分析，不做通道间联合模型。
- IQ 当前仅支持单分量复指数模型，不支持 IQ 多分量、复数调制或 IQ 压力测试。
- 不支持 MAT v7.3/HDF5、复数 MAT、非均匀采样。
- 参数不确定度为线性拟合近似，频率行是 1/T 分辨率，不是严格置信区间。
- 50 万点属于极端输入，浏览器 Worker 约 30 秒；正常样本约 1–2 秒。
- 不保证获奖；正式赛事规则仍待核验。
- API Key 只通过 Qoder Sites Secrets 配置，不进入源码或聊天。
- 发布使用 Qoder CN 桌面端 Sites 面板/MCP；不要用 CN CLI 直接 `prepare_site`。
