# SignalInsight

通信与信号处理实验的**模型辨识、参数估计、多模型比较与可信度分析**平台。

当前为 Qoder Sites 提交版：浏览器内执行确定性数值分析，Qoder Edge Function 负责可选的 Qwen 解释。

- **公开站点：** <https://signal-insight-s31b5iv5ld0.qoder.zone>
- **当前状态：** 已公开发布并通过单频、双频、unknown、CSV 上传与 Function 健康检查
- **Qwen 状态：** 代码已部署，`DASHSCOPE_API_KEY` 尚未配置；当前显示确定性规则解释
- **奖项说明：** 尚未获得确切赛事评分规则，无法保证获奖或确认格式完全合规

## 当前提交版能力

| 能力 | 状态 |
|---|---|
| 内置单频 / 双频 / 库外噪声示例 | 已实现 |
| CSV 上传、时间/信号字段映射 | 已实现 |
| Hann 窗 FFT、谱峰检测 | 已实现 |
| 单频 / 多频变量投影拟合 | 已实现，最多 3 个频点 |
| RMSE、R²、AIC、BIC | 已实现 |
| 残差、可信证据、unknown 拒判 | 已实现 |
| JSON 报告导出 | 已实现 |
| Qwen 解释 | 待配置 Secret |
| Python FastAPI 后端 | 已部分实现，未部署到线上 |

## 目录

```text
backend/      Python FastAPI、算法、测试、迁移
site/         Qoder Sites 提交版源码与发布描述
contracts/    OpenAPI 1.1.0、样例和兼容性规则
fixtures/     固定仿真数据与真值
docs/         重构后的产品、架构、接口、运维、测试和优化文档
```

## 快速验证

站点：

```bash
python -m http.server 4173 --bind 127.0.0.1 --directory site/dist
node site/test/dsp.test.mjs
node site/test/function.test.mjs
```

后端：

```bash
cd backend
uv sync --dev
uv run pytest
uv run ruff check app tests scripts
uv run mypy app
```

## 文档

- [产品与范围](docs/01-产品与范围.md)
- [系统架构与算法](docs/02-系统架构与算法.md)
- [接口与数据契约](docs/03-接口与数据契约.md)
- [开发、发布与 API Key 配置](docs/04-开发发布与密钥配置.md)
- [测试与验收](docs/05-测试与验收.md)
- [审计与交接](docs/06-审计与交接.md)
- [优化路线图](docs/07-优化路线图.md)

## 安全

- 不提交 `.env`、API Key、数据库文件、上传数据或运行制品。
- Qwen 密钥只通过 Qoder Sites Secrets 安全输入，写入后不可回读。
- 公开版只把结构化数值摘要发送给 Qwen，不上传原始序列。
