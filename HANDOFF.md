# SignalInsight 新对话交接书

> 生成日期：2026-11-16  
> 状态：Qoder Sites 公开提交版已发布；Python 后端方向暂停并从工作区移除  
> 这是新对话的首要入口。与旧设计文档冲突时，以本文件和实际 `site/` 源码为准。

---

## 1. 项目当前方向

SignalInsight 最初规划为 Vue + FastAPI + SQLite 的完整信号分析平台，但该设定已被推翻。

当前唯一交付目标是：

> 在 Qoder Sites 上发布一个可用于天池比赛提交的浏览器端信号可信分析演示。

现在的实现不再依赖 Python 后端，所有核心数值计算在浏览器本地完成，Qoder Sites Edge Function 只负责可选的 Qwen 解释。

`立项确定书.md` 继续保留，作为原始动机、研究问题和比赛背景依据；它不是当前技术实现说明。

---

## 2. 线上发布状态

- 公开地址：<https://signal-insight-s31b5iv5ld0.qoder.zone>
- 访问模式：public
- 生命周期：active
- Site ID：`01a1e4bb-ea05-7b36-88f4-72a743ddb34d`
- Project ID：`01a1e4bb-ea05-7036-8eea-6bdc90a0ab26`
- 当前发布 action：`0ce2bc13-f6ea-49d2-a9ba-775b9ae53345`
- 当前 Function：`app`，edge runtime，已发布
- 当前站点 Secrets：空
- Function `/functions/v1/app/health` 返回：`configured:false`

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

---

## 4. 明确未实现

- AM、FM 自动辨识
- MAT 文件
- 多通道批量分析
- 复数 IQ
- 非均匀采样
- Python FastAPI/SQLite 线上部署
- 用户系统、历史持久化、共享报告
- Qwen 真实调用（Secret 未配置）

不能把浏览器 MVP 描述为完整 Python 后端；不能把未实现模型说成已支持。

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

已删除：`backend/`、`backend/.venv`、`contracts/`、`fixtures/`、`docs/`、旧审计会话、缓存、旧根设计文档。

保留 `site/test/` 是因为它直接验证线上算法和 Function，不是无关文件。

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

## 7. Qwen 配置现状

当前 Secret 为空，AI 按钮禁用并显示“Qwen 尚未配置”。

Qoder CLI 已安装到：

```text
C:\Users\y\.qoder-cli
```

版本：`1.1.89`，尚未加入系统 PATH。

启动：

```powershell
& "$HOME\.qoder-cli\qoder.cmd"
```

登录：

```text
/login
```

打开站点面板：

```text
/sites
```

选择 `SignalInsight`，进入环境变量/Secrets，添加：

```text
名称：DASHSCOPE_API_KEY
值：百炼 API Key
```

不要把密钥放入聊天、源码、Git 或命令行参数。

旧 Qwen draft `44149eab-d4f3-4dca-8da6-583ca2447c18` 早于后续 CSS 和健康检查修改，必须视为过期。Secret 同步后应基于最新 `site/` 新建 action，声明 `secretNames: ["DASHSCOPE_API_KEY"]`，再发布并验证：

1. `get_site(include:["secrets"])`
2. `prepare_site`
3. `publish_site`
4. `/functions/v1/app/health` 返回 `configured:true`
5. 点击 AI 解释，确认返回结构化解释

默认模型和端点：

```text
qwen-plus
https://dashscope.aliyuncs.com/compatible-mode/v1
```

如账号不支持，需发布声明 `QWEN_MODEL` 的新版本。

---

## 8. 验证基线

清理前最后验证：

- DSP Node 测试通过
- Function Node 测试通过
- 单频 93.7001 Hz
- 双频 80.4999 / 173.2000 Hz
- 纯噪声 unknown
- 公开站点单频/双频/unknown/CSV 均通过
- 未上传时映射面板隐藏
- AI 未配置时按钮禁用
- 线上 Function health HTTP 200
- 浏览器控制台无应用错误

清理后只需保留并重新运行：

```bash
node site/test/dsp.test.mjs
node site/test/function.test.mjs
python -m http.server 4173 --bind 127.0.0.1 --directory site/dist
```

---

## 9. Git 历史与远端

历史已找到，没有删除或重建。

- 历史提交数：43（清理提交之前）
- 最早提交：`91025b5 chore: establish project documentation baseline`
- 清理前主线：`ab91832 docs: record local Qoder CLI installation`
- 当前分支：`main`
- 远端：尚未配置

查看完整历史：

```bash
git log --oneline --reverse
```

本次部署收敛会形成新的清理提交，历史保留。

建议另一台电脑通过私有远端协作：

```bash
git remote add origin <private-repo-url>
git push -u origin main
```

另一台电脑：

```bash
git clone <private-repo-url> SignalInsight
cd SignalInsight
git config user.name "<name>"
git config user.email "<email>"
```

不要公开仓库，避免违反赛事共享规则。

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

1. 配置 `DASHSCOPE_API_KEY`，新建 action 并发布 Qwen。
2. 核对天池正式规则、提交格式和截止时间。
3. 将 DSP 移入 Web Worker，避免大样本阻塞 UI。
4. 拆分 `app.js` 和 `dsp.js`，引入 JS 静态检查。
5. 扩展 AM/FM 前先设计可靠模型和证据。
6. 确认比赛提交是否只要求公开 URL、代码包或视频，再决定是否增加持久化。

---

## 12. 风险与不可承诺事项

- 未获得官方规则，无法保证获奖或确认格式合规。
- Qwen 未真实联调。
- 单频/多频算法只对候选库和当前采样条件负责。
- 可信等级不是概率。
- 浏览器 MVP 不是 Python 后端。
- 公开站点可匿名访问，但 Function 依赖账号 Secret 和额度。
- 不应在公开仓库保存密钥、测试数据或赛事受限材料。

---

## 13. 决策记录

- 放弃“今晚前继续完整 Python 后端”的路线。
- 接受浏览器重写带来的代码重复，以换取 Qoder Sites 可部署性。
- 保留项目原始立项书作为背景，不再以其完整技术方案约束当前提交版。
- 保留 Git 历史，不删除历史提交。
- 保留部署验证测试，即使它们不随网站打包。
