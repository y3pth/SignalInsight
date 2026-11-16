# SignalInsight 新对话交接书

> 更新日期：2026-11-17
> 状态：Qoder Sites 公开站点可用；Qwen 已配置并在线；新版 AI UI 已发布
> 这是新对话的首要入口。与旧设计文档冲突时，以本文件和实际 `site/` 源码为准。

---

## 1. 项目当前方向

SignalInsight 最初规划为 Vue + FastAPI + SQLite 的完整信号分析平台，但该设定已被推翻。

当前唯一交付目标是：

> 在 Qoder Sites 上发布一个可用于天池比赛提交的浏览器端信号可信分析演示。

所有核心数值计算在浏览器本地完成，Qoder Sites Edge Function 只负责可选的 Qwen 解释。`立项确定书.md` 继续保留，作为原始动机、研究问题和比赛背景依据；它不是当前技术实现说明。

---

## 2. 线上发布状态

- 公开地址：<https://signal-insight-s31b5iv5ld0.qoder.zone>
- 访问模式：public
- 生命周期：active
- Site ID：`01a1e4bb-ea05-7b36-88f4-72a743ddb34d`
- Project ID：`01a1e4bb-ea05-7036-8eea-6bdc90a0ab26`
- 当前线上发布 action：`41485a58-2169-4c64-bb96-05cced35d199`
- 当前 Function：`app`，edge runtime，已发布
- 站点 Secret：`DASHSCOPE_API_KEY` 已配置
- Function `/functions/v1/app/health` 返回：`{"ok":true,"configured":true,"provider":"dashscope-compatible"}`
- 线上 Qwen 已真实调用成功：单频、双频、噪声 unknown、CSV 上传均已验证

新版 AI UI（限制展示、请求超时、错误细分）已发布并完成线上回归。

本地发布描述：

```text
site/.SignalInsight.qoder.site
```

不要手工修改该文件。

---

## 3. 已交付能力

- 内置单频示例：93.7 Hz
- 内置双频示例：80.5 / 173.2 Hz
- 库外噪声示例：输出 unknown
- CSV 上传：UTF-8/BOM，逗号/制表符/分号
- 时间列和信号列映射
- Hann 窗 FFT、谱峰检测
- 单频和最多三频的变量投影拟合
- golden-section 频率精化
- RMSE、R²、AIC、BIC
- 残差 ACF 与残余谱结构
- reliable / caution / unreliable / insufficient_evidence
- unknown 时拒绝给出参数结论
- 时域、频谱、残差 Canvas 图
- JSON 报告导出
- Qwen 解释代理及确定性规则降级
- Qwen 解释已在线可用
- 新版 AI UI 已发布：
  - Qwen 返回的 `limitations` 展示
  - health 8 秒超时、explain 30 秒超时
  - `service_not_configured`、`upstream_error` 等错误细分
- DSP 已移入 Web Worker，失败时自动回退主线程
- AI 结果按 payload 做会话缓存；Qwen 端点增加 60 次/分钟/IP 的软限流，可用 `RATE_LIMIT_MAX` 调整
- CSV 解析抽成 `csv.js`，支持引号内换行、自动识别分隔符、前 3 行预览
- 分析结果增加 `aria-live` 播报

---

## 4. 明确未实现

当前不能宣称支持：

- AM、FM 自动辨识
- MAT 文件
- 多通道批量分析
- 复数 IQ
- 非均匀采样
- Python FastAPI/SQLite 线上部署
- 用户系统、历史持久化、共享报告

P2 会优先做 AM/FM 候选模型与参数不确定性；MAT、IQ、非均匀采样、多通道另立阶段。不能把浏览器 MVP 描述为完整 Python 后端；不能把未实现模型说成已支持。

---

## 5. 当前文件结构

```text
SignalInsight/
├── 立项确定书.md                  # 原始背景，保留
├── README.md                     # 当前入口
├── AGENTS.md                     # 新 Qoder 会话规则
├── HANDOFF.md                    # 本交接书
├── .gitignore
├── .gitattributes
└── site/
    ├── .SignalInsight.qoder.site # 发布描述，不要手改
    ├── dist/
    │   ├── index.html
    │   ├── styles.css
    │   ├── dsp.js                # 浏览器数值核心
    │   └── app.js                # 状态、图表、CSV、AI 请求
    ├── functions/
    │   ├── index.ts              # Deno.serve
    │   └── handler.ts            # Qwen 代理、校验、降级
    └── test/
        ├── dsp.test.mjs
        └── function.test.mjs
```

`site/test/` 直接验证线上算法和 Function，不是无关文件。

---

## 6. 关键算法

### 6.1 数据约束

- 单通道
- 实数
- 近似均匀采样
- 时间严格递增
- 采样抖动最大相对误差 ≤ 5%
- 64–500,000 样本
- CSV 上传浏览限制 10 MiB

### 6.2 频谱

- 去均值
- Hann 窗
- radix-2 FFT
- 幅度谱
- 中位数幅度作为显著度基线

### 6.3 模型

```text
y(t) = c + Σ Aᵢ sin(2πfᵢ(t-t₀)+φᵢ)
```

- 单频：1 分量
- 多频：2–3 分量
- 给定频率时线性最小二乘求 offset 和 cos/sin 系数
- 频率使用 golden-section 在局部范围精化
- 多频使用坐标优化迭代

### 6.4 模型选择

- 单频作为保守基线
- 多频必须同时满足：
  - BIC 至少改善 10
  - RSS 至少下降 10%
- 否则选单频

### 6.5 unknown

满足任一条件即 unknown：

- 无显著谱峰
- 主谱峰显著度 < 6
- 最佳候选 R² < 0.5

### 6.6 可信度

证据包含：

- 主谱峰显著度
- R² / RMSE
- 残差最大绝对 ACF
- 残余谱显著度
- 观测时长和 1/T 分辨率

可信等级是规则汇总，不是概率。

---

## 7. Qwen 配置与发布流程

当前账号：Qoder CN，用户名 `mathcrazy`。

### 7.1 CLI 位置

中国版 CLI（npm 安装，用户目录）：

```text
C:\Users\y\.qodercn-cli\qodercn.cmd
```

国际版 CLI：

```text
C:\Users\y\AppData\Roaming\SPB_Data\.qoder-cli\qoder.cmd
```

两者不要混用。CN 站点必须用 `qodercn` / Qoder CN 桌面端。CLI 配置目录为 `~/.qoder-cn`。

### 7.2 Secret

Secret 名称：

```text
DASHSCOPE_API_KEY
```

通过 Qoder CN 桌面端站点设置 → 环境变量/Secrets 输入。不要放入聊天、源码、Git 或命令行参数。

当前 Secret 是站点级配置。已发布的 Function 会在运行时读取它，因此新增 Secret 后 health 立即变为 `configured:true`，不需要为此重新发布。但以后重新发布 Function 时，建议显式传：

```json
"secretNames": ["DASHSCOPE_API_KEY"]
```

可选配置：

```text
QWEN_MODEL            默认 qwen-plus
DASHSCOPE_BASE_URL    默认 https://dashscope.aliyuncs.com/compatible-mode/v1
```

只有使用国际站 Key 时才需要改 `DASHSCOPE_BASE_URL`。

### 7.3 发布路径

**优先使用 Qoder CN 桌面端的 Sites 面板 / Sites MCP 发布。**

原因：CN CLI 1.1.89 只接受旧版扁平 `.qoder.site` 描述文件（顶层 actionId/projectId/siteId/deploymentId/artifactSha256/indexSha256/indexHtml），当前描述文件是国际版生成的 `design + publication` 嵌套格式。CN CLI 的 `get_context` / `prepare_site` 会报 `sites_document_invalid` 或 `sites_invalid_request`。

不要为了迁就 CN CLI 手工改发布描述文件。描述文件只保留 `site/.SignalInsight.qoder.site` 一个，不要同时在仓库根生成第二个。需要发布时使用桌面端 MCP：

1. `get_context`
2. `prepare_site`（projectRoot=`F:/SignalInsight/site`，webDirectory=`dist`，functionDirectory=`functions`，projectId 如上，secretNames 含 `DASHSCOPE_API_KEY`）
3. `get_publish_status` 直到 `artifactReady` / `dependenciesReady` / `canPublish`
4. `publish_site`
5. 验证 health、单频/双频/噪声/CSV、AI、导出

发布是公网可见操作，执行前要得到用户明确确认。发布后不要手改 `site/.SignalInsight.qoder.site`。

### 7.4 AI 防滥用约束

`/functions/v1/app/explain` 是公开端点。任何限流/缓存方案都必须满足：

- 正常单用户连续点击、单频/双频/噪声/CSV 切换不受影响
- 优先用结果哈希缓存相同请求，减少重复 token
- 只对异常高频请求做软限制，不阻断正常演示
- 在百炼侧设置预算/告警，避免额度被刷

---

## 8. 验证基线

2026-11-17 线上试运行：

- 单频 93.7002 Hz，较高可信
- 双频 80.50 / 173.20 Hz
- 纯噪声 unknown / 证据不足
- CSV 上传 50 Hz 测试数据：50.0000 Hz，幅值 2.0001，相位 0.1999，R² 1.0000
- Qwen 对单频、双频、噪声、CSV 均返回结构化解释
- 报告导出 JSON 含 3 个候选模型、可靠性和方法边界
- 浏览器控制台无 error/warning
- `/explain` 网络请求 200
- 516px 窄视口无横向溢出

本地验证：

```bash
node site/test/dsp.test.mjs
node site/test/csv.test.mjs
node site/test/function.test.mjs
python -m http.server 4173 --bind 127.0.0.1 --directory site/dist
```

新版 AI UI 已用本地 mock 验证：限制展示、超时提示、上游错误提示均正常。

---

## 9. Git 状态与分支

- 当前分支：`feat/ai-explanations`
- 最新提交：`4dc92d2 docs: refresh handoff for live Qwen and CN publishing`
- AI UI 提交：`43c941f feat: surface AI limitations and harden Qwen requests`
- `main` 仍为 `ff2b226 refactor: reduce repository to deployed Qoder Sites deliverable`
- 远端：尚未配置
- 不直接修改 `main`；每个任务使用独立分支
- 提交身份使用仓库历史已有作者，不在全局改写 Git 配置

---

## 10. 跨机器异步规则

- 一任务一分支，不共享同一个未合并分支。
- 开始前 `git pull --ff-only`。
- 禁止直接修改 `main`。
- 合并前 `git merge origin/main`，不要强推。
- Qoder 记忆不同步，`HANDOFF.md`、`AGENTS.md` 和 Git 是事实来源。
- Qoder Sites 的 action 记录跨机器不可恢复，指定一台发布机；另一台机器负责源码与 PR。
- 如另一台必须发布，基于同账号和同一 Site/Project 新建 action，不复用旧 action。
- Secret 是站点级服务端配置，不进入 Git；不需要复制到每台电脑。

推荐新对话启动指令：

```text
请先读取 HANDOFF.md、AGENTS.md、README.md 和立项确定书.md，
然后执行 git status --short --branch、git branch --show-current、git log -5 --oneline。
当前唯一交付物是 site/ 下的 Qoder Sites 应用，不要恢复已删除的 Python 后端。
本次任务：<填写任务>
```

---

## 11. 后续优先级

### P1：质量与架构

1. [已完成] DSP 移入 Web Worker，失败回退主线程。
2. [已完成] AI 结果缓存 + 60 次/分钟/IP 软限流；数字一致性审计仍待补。
3. [已完成] CSV 引号换行、数据预览、aria-live 播报。
4. [进行中] 浏览器 E2E 回归与真实 CSV fixtures。
5. [部分完成] 已抽离 `csv.js`；`app.js` / `dsp.js` 仍较大，静态检查待补。

### P2：模型扩展

1. AM/FM 候选模型与保守证据选择。
2. 参数置信区间/不确定性展示。
3. 本地分析历史（localStorage）或报告增强。
4. MAT、复数 IQ、非均匀采样、多通道另立阶段，不能虚假宣称。

### 比赛

- 天池报名/组队、实名认证、阿里云大学生认证
- 11 月 30 日 18:00 前发布论坛作品帖
- 作品帖五部分：自我介绍、一句话作品、为什么做、5 步以内怎么用、Qoder 过程与截图
- 3 分钟演示脚本
- 不保证获奖；以官方规则为准

---

## 12. 风险与不可承诺事项

- 未获得官方评分权重，无法保证获奖或确认格式合规。
- Qwen 已真实联调，但公开端点仍受额度、网络和模型可用性影响。
- 单频/多频算法只对候选库和当前采样条件负责。
- 可信等级不是概率。
- 浏览器 MVP 不是 Python 后端。
- 公开站点可匿名访问，Function 依赖账号 Secret 和额度。
- 不应在公开仓库保存密钥、测试数据或赛事受限材料。
- CN CLI 与当前描述文件格式不兼容；发布统一走桌面端 Sites MCP。

---

## 13. 决策记录

- 放弃“今晚前继续完整 Python 后端”的路线。
- 接受浏览器重写带来的代码重复，以换取 Qoder Sites 可部署性。
- 保留项目原始立项书作为背景，不再以其完整技术方案约束当前提交版。
- 保留 Git 历史，不删除历史提交。
- 保留部署验证测试，即使它们不随网站打包。
- 新版 AI UI 在独立分支提交，完成线上回归后发布。
- AI 防滥用以“不影响正常演示”为硬约束，优先缓存和软限制。
