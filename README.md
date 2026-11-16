# SignalInsight

通信与信号处理实验的浏览器端模型辨识、参数估计、多模型比较与可信度分析平台。

当前唯一交付物是 Qoder Sites 公开提交版。

- **公开站点：** <https://signal-insight-s31b5iv5ld0.qoder.zone>
- **当前状态：** 已公开发布，单频/双频/unknown/CSV/报告导出可用
- **AI：** Qwen Function 已部署，`DASHSCOPE_API_KEY` 尚未配置；当前使用确定性解释
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
node site/test/function.test.mjs
python -m http.server 4173 --bind 127.0.0.1 --directory site/dist
```

## 边界

- 只支持实数、单通道、近似均匀采样 CSV。
- 不包含 AM/FM、MAT、复数 IQ 或非均匀分析。
- 不保证获奖；正式赛事规则仍待核验。
- API Key 只通过 Qoder Sites Secrets 配置，不进入源码或聊天。
