import { listScenarios, getScenario, generateScenarioSignal, analyzeScenario, buildLearnPayload } from "./learn.js?v=12";
import { fetchLearnExplanation, fetchAiHealth } from "./service.js?v=12";
import { drawPlot } from "./charts.js?v=12";

const PROGRESS_KEY = "signalinsight.learn.v1";
const THEME_KEY = "signalinsight.theme";
const AI_MODELS = ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-long"];

const STEPS = [
  { id: "observe", no: "01", label: "观察" },
  { id: "hypothesize", no: "02", label: "假设" },
  { id: "verify", no: "03", label: "验证" },
  { id: "conclude", no: "04", label: "结论" },
];

const CATEGORIES = ["clean", "modulation", "defect", "out-of-library"];
const CATEGORY_META = {
  clean: { label: "干净信号", chip: "干净" },
  modulation: { label: "调制信号", chip: "调制" },
  defect: { label: "数据缺陷", chip: "缺陷" },
  "out-of-library": { label: "库外与边界", chip: "库外" },
};
const CATEGORY_HINT = {
  clean: "这段属于「干净」组：先看时域是否规整、频谱有几个显著峰。若只有一个稳定主峰，最简模型可能已经足够。",
  modulation: "留意载波两侧是否成对出现边带，以及时域包络是否周期性起伏——这是幅度/频率调制的结构线索。",
  defect: "先做数据体检：削顶、漂移、阶梯、采样抖动或观测过短，都会让拟合看起来变好却不可信。",
  "out-of-library": "目标是判断信号是否在候选库之外：如果没有稳定主峰，或定频拟合解释力极低，正确结论可能是拒绝结论。",
};
const MODEL_LABELS = {
  single_tone: "单频",
  multi_tone_2: "双频",
  multi_tone_3: "三频",
  am: "AM 调制",
  fm: "FM 调制",
  iq_single: "IQ 复指数",
};
const HEALTH_LABELS = { ok: "通过", warn: "注意", fail: "失败" };
const EVIDENCE_HELP = {
  spectral_prominence: "主谱峰相对中位数基线的显著度，用来判断是否存在确定的频率成分。",
  fit_quality: "R² 与 RMSE，衡量模型解释了多少变化。高 R² 并不等于数据干净。",
  residual_whiteness: "残差自相关是否接近白噪声。仍有结构说明模型遗漏了成分。",
  residual_structure: "残差中是否残留周期或低频结构，提示欠拟合或数据缺陷。",
  frequency_resolution: "频率分辨率约为 1/T，观测越短，频率不确定度越大。",
  modulation_structure: "包络或瞬时频率的周期结构，用来判断 AM/FM 调制是否成立。",
  data_health: "削顶、漂移、跳变、量化、Nyquist 等数据体检结果。",
};

const elements = {
  scenarioList: document.getElementById("scenario-list"),
  lesson: document.getElementById("lesson"),
  lessonEmpty: document.getElementById("lesson-empty"),
  lessonContent: document.getElementById("lesson-content"),
  progress: document.getElementById("learn-progress"),
  progressText: document.getElementById("catalog-progress-text"),
  progressTrack: document.getElementById("progress-track"),
  progressFill: document.getElementById("progress-fill"),
  themeToggle: document.getElementById("theme-toggle"),
  toast: document.getElementById("toast"),
};

let catalog = [];
let progress = { learned: {}, lastScenario: null, lastStep: 0 };
let toastTimer = null;

const state = {
  scenarioId: null,
  scenario: null,
  data: null,
  result: null,
  match: null,
  stepIndex: 0,
  maxStep: 0,
  resultRevealed: false,
  evidenceOpen: null,
  ai: {
    health: null,
    model: AI_MODELS[0],
    loading: false,
    explanation: null,
    error: null,
    cache: {},
  },
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function formatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute >= 1000) return value.toFixed(0);
  if (absolute >= 100) return value.toFixed(1);
  if (absolute >= 1) return value.toFixed(2);
  if (absolute >= 0.01) return value.toFixed(3);
  if (absolute === 0) return "0";
  return value.toExponential(2);
}

function percent(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3200);
}

/* ---- theme ---- */

function applyTheme(theme, { persist = true } = {}) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "light" ? "#f3f7ff" : "#0a0908";
  if (elements.themeToggle) {
    const target = theme === "light" ? "dark" : "light";
    elements.themeToggle.dataset.target = target;
    elements.themeToggle.textContent = target === "light" ? "浅色" : "深色";
    elements.themeToggle.setAttribute("aria-label", target === "light" ? "切换到浅色模式" : "切换到深色模式");
  }
  if (persist) {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage unavailable */ }
  }
  requestAnimationFrame(redrawCharts);
}

function initTheme() {
  let saved = "dark";
  try { saved = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { /* storage unavailable */ }
  applyTheme(saved, { persist: false });
  elements.themeToggle?.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  });
}

/* ---- progress ---- */

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const learned = parsed && typeof parsed.learned === "object" && parsed.learned ? parsed.learned : {};
    return {
      learned,
      lastScenario: typeof parsed?.lastScenario === "string" ? parsed.lastScenario : null,
      lastStep: Number.isInteger(parsed?.lastStep) ? parsed.lastStep : 0,
    };
  } catch {
    return { learned: {}, lastScenario: null, lastStep: 0 };
  }
}

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      learned: progress.learned,
      lastScenario: progress.lastScenario,
      lastStep: progress.lastStep,
      updatedAt: new Date().toISOString(),
    }));
  } catch { /* storage unavailable */ }
}

function markLearned(id) {
  if (progress.learned[id]) return;
  progress.learned[id] = new Date().toISOString();
  saveProgress();
  renderCatalog();
  updateProgressUi();
}

function updateProgressUi() {
  const total = catalog.length;
  const done = catalog.filter((scenario) => progress.learned[scenario.id]).length;
  if (elements.progress) elements.progress.textContent = `已学 ${done} / ${total}`;
  if (elements.progressText) elements.progressText.textContent = `${done} / ${total}`;
  if (elements.progressFill) elements.progressFill.style.width = total ? `${(done / total) * 100}%` : "0%";
  if (elements.progressTrack) {
    elements.progressTrack.setAttribute("aria-valuemax", String(total));
    elements.progressTrack.setAttribute("aria-valuenow", String(done));
  }
}

/* ---- catalog ---- */

function scenarioCard(scenario) {
  const active = scenario.id === state.scenarioId;
  const learned = Boolean(progress.learned[scenario.id]);
  const meta = CATEGORY_META[scenario.category] ?? { chip: scenario.category };
  const dots = [1, 2, 3].map((level) => `<i class="${level <= scenario.difficulty ? "on" : ""}"></i>`).join("");
  return `
    <button class="scenario-card${active ? " is-active" : ""}${learned ? " is-learned" : ""}" type="button"
      data-scenario="${escapeHtml(scenario.id)}" aria-pressed="${active}">
      <span class="scenario-head">
        <span class="scenario-title">${escapeHtml(scenario.title)}</span>
        ${learned ? '<span class="learned-badge">已学</span>' : ""}
      </span>
      <span class="scenario-summary">${escapeHtml(scenario.summary)}</span>
      <span class="scenario-meta">
        <span class="category-chip" data-category="${escapeHtml(scenario.category)}">${escapeHtml(meta.chip)}</span>
        <span class="difficulty" role="img" aria-label="难度 ${scenario.difficulty} / 3">${dots}</span>
      </span>
    </button>`;
}

function renderCatalog() {
  const groups = new Map(CATEGORIES.map((category) => [category, []]));
  for (const scenario of catalog) {
    if (!groups.has(scenario.category)) groups.set(scenario.category, []);
    groups.get(scenario.category).push(scenario);
  }
  const sections = [...groups.entries()]
    .filter(([, items]) => items.length)
    .map(([category, items]) => `
      <section class="scenario-group">
        <h2>${escapeHtml(CATEGORY_META[category]?.label ?? category)}</h2>
        <div class="scenario-items">${items.map(scenarioCard).join("")}</div>
      </section>`)
    .join("");
  elements.scenarioList.innerHTML = sections;
}

/* ---- lesson rendering ---- */

function openScenario(id, { scroll = true } = {}) {
  const scenario = getScenario(id);
  if (!scenario) return;
  if (state.scenarioId === id) {
    if (scroll) scrollToLesson();
    return;
  }
  let data;
  let analyzed;
  try {
    data = generateScenarioSignal(id);
    analyzed = analyzeScenario(id);
  } catch (error) {
    showToast(`场景计算失败：${error.message}`, true);
    return;
  }
  const learned = Boolean(progress.learned[id]);
  const savedStep = progress.lastScenario === id ? Math.max(0, Math.min(3, progress.lastStep || 0)) : 0;
  state.scenarioId = id;
  state.scenario = scenario;
  state.data = data;
  state.result = analyzed.result;
  state.match = analyzed.match;
  state.evidenceOpen = null;
  state.ai.explanation = state.ai.cache[state.ai.model] ?? null;
  state.ai.error = null;
  state.ai.loading = false;
  state.maxStep = Math.max(savedStep, learned ? 3 : 0);
  state.resultRevealed = learned || savedStep >= 2;
  state.stepIndex = Math.min(savedStep, state.maxStep);
  progress.lastScenario = id;
  progress.lastStep = state.stepIndex;
  saveProgress();
  if (state.stepIndex === 3) markLearned(id);
  renderCatalog();
  renderLesson();
  if (scroll) scrollToLesson();
}

function scrollToLesson() {
  elements.lesson.scrollIntoView({ behavior: "smooth", block: "start" });
}

function nextScenario() {
  const index = catalog.findIndex((scenario) => scenario.id === state.scenarioId);
  return catalog[index + 1] ?? null;
}

function goToStep(index) {
  if (index < 0 || index > 3 || index > state.maxStep) return;
  state.stepIndex = index;
  progress.lastStep = index;
  saveProgress();
  if (index === 3) markLearned(state.scenarioId);
  renderLesson();
  scrollToLesson();
}

function advanceStep() {
  const target = state.stepIndex + 1;
  if (target > 3) return;
  state.maxStep = Math.max(state.maxStep, target);
  goToStep(target);
}

function stepTrack() {
  return `
    <ol class="step-track" aria-label="四步学习流程">
      ${STEPS.map((step, index) => {
        const active = index === state.stepIndex;
        const done = index < state.stepIndex || (index === 2 && state.resultRevealed) || (index === 3 && progress.learned[state.scenarioId]);
        const disabled = index > state.maxStep;
        return `<li>
          <button class="step-button${active ? " is-active" : ""}${done ? " is-done" : ""}" type="button"
            data-step-index="${index}" ${disabled ? "disabled" : ""} ${active ? 'aria-current="step"' : ""}>
            <span class="step-no">${step.no}</span><span class="step-label">${step.label}</span>
          </button>
        </li>`;
      }).join("")}
    </ol>`;
}

function chartCard(id, code, title, small, legend, canvasLabel) {
  return `
    <article class="learn-chart-card">
      <div class="card-head"><div><span>${code}</span><h3>${title}</h3></div><small>${small}</small></div>
      <canvas id="${id}" aria-label="${canvasLabel}"></canvas>
      <div class="learn-chart-foot"><span>${legend}</span><span>线性坐标</span></div>
    </article>`;
}

function spectrumMax(result = state.result) {
  if (!result) return 0;
  const category = state.scenario?.category;
  if (result.unknown || category === "defect" || category === "out-of-library") return result.nyquist;
  const frequencies = (result.best?.frequencies ?? []).filter(Number.isFinite);
  if (!frequencies.length) return result.nyquist;
  const peak = Math.max(...frequencies);
  if (!Number.isFinite(peak) || peak <= 0) return result.nyquist;
  return Math.min(result.nyquist, peak * 1.8 + 20);
}

function spectrumLabel(result = state.result) {
  if (!result) return "";
  const max = spectrumMax(result);
  return `0 – ${formatNumber(max)} Hz${max < result.nyquist - 1 ? "（局部）" : ""}`;
}

function observePanel() {
  const { scenario, data, result } = state;
  const sampleCount = data.time.length;
  return `
    <div class="step-panel">
      <div class="panel-card">
        <div class="card-head"><div><span>01 / OBSERVE</span><h3>先看数据，不急着套模型</h3></div><small>观察记录</small></div>
        <p class="panel-lede">${CATEGORY_HINT[scenario.category] ?? ""}</p>
        <div class="fact-strip">
          <span class="fact">样本 <b>${sampleCount}</b></span>
          <span class="fact">采样率 <b>${formatNumber(result.sampleRate)} Hz</b></span>
          <span class="fact">时长 <b>${formatNumber(result.duration)} s</b></span>
          <span class="fact">Nyquist <b>${formatNumber(result.nyquist)} Hz</b></span>
          <span class="fact">类型 <b>${data.kind === "iq" ? "IQ 双路" : "实数单通道"}</b></span>
        </div>
      </div>
      <div class="learn-charts">
        ${chartCard("learn-time-chart", "TIME", "时域观测", data.kind === "iq" ? "I 路 / Q 路" : "单通道", data.kind === "iq" ? "I 路 · Q 路" : "观测序列", "时域观测曲线")}
        ${chartCard("learn-spectrum-chart", "FFT", "幅度谱", "Hann 窗", spectrumLabel(result), "信号幅度谱")}
      </div>
      <p class="panel-note">读图顺序：先数显著峰的数量、看它们的位置和宽度；再检查时域有没有削顶、漂移、阶梯或异常抖动。干净与调制场景默认聚焦主要成分；缺陷与库外场景显示完整 Nyquist 频段，便于发现谐波与混叠线索。</p>
    </div>`;
}

function focusEvidence() {
  const ids = new Set(state.scenario.principle?.evidenceIds ?? []);
  return (state.result.reliability.evidence ?? []).filter((item) => ids.has(item.id));
}

function hypothesizePanel() {
  const { scenario } = state;
  const evidence = focusEvidence();
  const chips = evidence.map((item) => {
    const open = state.evidenceOpen === item.id;
    return `<button class="evidence-chip${open ? " is-open" : ""}" type="button" data-evidence-id="${escapeHtml(item.id)}" aria-expanded="${open}">${escapeHtml(item.label)}</button>`;
  }).join("");
  const selected = evidence.find((item) => item.id === state.evidenceOpen);
  const detail = selected
    ? `<div class="evidence-detail"><strong>${escapeHtml(selected.label)}</strong>${escapeHtml(EVIDENCE_HELP[selected.id] ?? "该证据会在验证步骤给出实际数值与判定。")}</div>`
    : "";
  return `
    <div class="step-panel">
      <div class="panel-card">
        <div class="card-head"><div><span>02 / HYPOTHESIZE</span><h3>提出假设</h3></div><small>模型阶梯</small></div>
        <p class="panel-lede">${escapeHtml(scenario.principle?.concept ?? "")}</p>
        <ul class="points-list">${(scenario.principle?.points ?? []).map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
      </div>
      <div class="panel-card">
        <div class="card-head"><div><span>CHECK</span><h3>你会检查哪些证据</h3></div><small>点击预览</small></div>
        <p class="panel-note">先想清楚每条证据要回答什么问题，再去验证步骤核对实际数值。候选按「单频 → 多频 → AM/FM」阶梯升级，升级必须同时满足 BIC 改善与残差下降。</p>
        <div class="evidence-chips">${chips || '<span class="panel-note">本场景没有额外证据项。</span>'}</div>
        ${detail}
      </div>
    </div>`;
}

function buildChecks() {
  const { scenario, result } = state;
  const expected = scenario.expected ?? {};
  const checks = [];
  if ("unknown" in expected) {
    checks.push({
      label: "结论策略",
      ok: result.unknown === expected.unknown,
      actual: result.unknown ? "拒绝结论" : "给出模型",
    });
  }
  if ("model" in expected) {
    checks.push({
      label: "推荐模型",
      ok: result.recommendedId === expected.model,
      actual: result.recommendedId ? (MODEL_LABELS[result.recommendedId] ?? result.recommendedId) : "暂不推荐",
    });
  }
  if ("reliability" in expected) {
    checks.push({
      label: "可信等级",
      ok: result.reliability.level === expected.reliability,
      actual: result.reliability.label,
    });
  }
  if ("health" in expected) {
    checks.push({
      label: "体检状态",
      ok: result.health.status === expected.health,
      actual: HEALTH_LABELS[result.health.status] ?? result.health.status,
    });
  }
  for (const [checkId, status] of Object.entries(expected.healthChecks ?? {})) {
    const check = result.health.checks.find((item) => item.id === checkId);
    checks.push({
      label: check?.label ?? checkId,
      ok: check?.status === status,
      actual: check ? (HEALTH_LABELS[check.status] ?? check.status) : "缺失",
    });
  }
  return checks;
}

function verdictCard() {
  const result = state.result;
  const reliabilityClass = result.reliability.level === "reliable" ? "" : result.reliability.level === "insufficient_evidence" ? "insufficient" : result.reliability.level;
  const checks = buildChecks();
  const passed = checks.filter((check) => check.ok).length;
  return `
    <div class="verdict-card">
      <div class="verdict-head">
        <div>
          <span class="eyebrow">MODEL COMPETITION</span>
          <h3>${result.unknown ? "证据不足，暂不推荐模型" : escapeHtml(result.best?.label ?? "—")}</h3>
        </div>
        <div class="verdict-badges">
          <span class="reliability-badge ${reliabilityClass}">${escapeHtml(result.reliability.label)}</span>
          <span class="category-chip">体检 ${HEALTH_LABELS[result.health.status] ?? result.health.status}</span>
        </div>
      </div>
      <div class="match-banner${state.match.ok ? "" : " is-off"}">
        ${state.match.ok ? "✓ 与标准结论一致" : "⚠ 与标准结论存在差异"} · ${passed} / ${checks.length} 项核对通过
      </div>
      <ul class="match-checks">
        ${checks.map((check) => `<li class="${check.ok ? "" : "is-off"}">${check.ok ? "✓" : "✗"} ${escapeHtml(check.label)}：${escapeHtml(check.actual)}</li>`).join("")}
      </ul>
    </div>`;
}

function candidateTable() {
  const result = state.result;
  return `
    <div class="panel-card">
      <div class="card-head"><div><span>CANDIDATES</span><h3>统一口径的模型竞争</h3></div><small>同一数据 · 同一指标</small></div>
      <div class="learn-table-wrap">
        <table>
          <thead><tr><th>模型</th><th>参数数</th><th>R²</th><th>RMSE</th><th>BIC</th><th>残差 RMS</th></tr></thead>
          <tbody>
            ${result.candidates.map((candidate) => {
              const best = result.best && candidate.id === result.best.id;
              return `<tr class="${best ? "best-row" : ""}">
                <td class="model-name">${escapeHtml(candidate.label)}${best ? " · 推荐" : ""}</td>
                <td>${candidate.metrics.freeParameters}</td>
                <td>${percent(candidate.metrics.r2)}</td>
                <td>${formatNumber(candidate.metrics.rmse)}</td>
                <td>${formatNumber(candidate.metrics.bic)}</td>
                <td>${formatNumber(candidate.residualAnalysis?.rms)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <p class="panel-note">BIC 对参数数量施罚：更复杂的模型必须带来足够大的 RSS 改善才值得升级。未知结论不是失败，而是证据不足时的诚实输出。</p>
    </div>`;
}

function evidenceList() {
  const evidence = focusEvidence();
  return `
    <div class="panel-card">
      <div class="card-head"><div><span>EVIDENCE</span><h3>本场景的关键证据</h3></div><small>规则汇总，不是概率</small></div>
      <div class="evidence-list">
        ${evidence.map((item) => `
          <div class="evidence-item">
            <span class="evidence-dot ${item.status === "warn" ? "warn" : item.status === "fail" ? "fail" : ""}" aria-hidden="true"></span>
            <div class="evidence-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></div>
            <span class="evidence-value">${escapeHtml(item.value)}</span>
          </div>`).join("")}
      </div>
      <div class="fact-strip">
        ${state.result.health.checks.map((check) => `<span class="fact">${escapeHtml(check.label)} <b>${HEALTH_LABELS[check.status] ?? check.status}</b></span>`).join("")}
      </div>
    </div>`;
}

function verifyPanel() {
  if (!state.resultRevealed) {
    return `
      <div class="step-panel">
        <div class="panel-card">
          <div class="card-head"><div><span>03 / VERIFY</span><h3>准备好了吗</h3></div><small>模型竞争</small></div>
          <p class="panel-lede">系统会用同一份数据比较单频、双频/三频、AM/FM 候选（IQ 场景使用复指数模型），再按 BIC、残差结构与数据体检给出可信度。先自己判断，再对照结果。</p>
          <div class="fact-strip">
            <span class="fact">候选数 <b>${state.result.candidates.length}</b></span>
            <span class="fact">样本 <b>${state.result.sampleCount}</b></span>
            <span class="fact">fs <b>${formatNumber(state.result.sampleRate)} Hz</b></span>
          </div>
          <div class="verify-cta"><button class="lesson-next" type="button" data-action="verify">展开验证结果 →</button></div>
        </div>
      </div>`;
  }
  const result = state.result;
  const modulation = result.best?.modulationView ?? null;
  return `
    <div class="step-panel">
      ${verdictCard()}
      <div class="metric-mini-grid">
        <div class="metric-mini"><span>拟合解释力 R²</span><strong>${percent(result.best?.metrics?.r2)}</strong></div>
        <div class="metric-mini"><span>RMSE</span><strong>${formatNumber(result.best?.metrics?.rmse)}</strong></div>
        <div class="metric-mini"><span>BIC 差距</span><strong>${formatNumber(result.reliability.bicGap)}</strong></div>
        <div class="metric-mini"><span>样本 / 采样率</span><strong>${result.sampleCount} / ${formatNumber(result.sampleRate)}</strong></div>
      </div>
      <div class="learn-charts">
        ${chartCard("learn-time-chart", "FIT", "时域：观测与拟合", "最佳候选", "观测 · 拟合", "观测与拟合曲线")}
        ${chartCard("learn-spectrum-chart", "FFT", "幅度谱", "Hann 窗", spectrumLabel(result), "信号幅度谱")}
      </div>
      ${modulation ? `<div class="learn-charts is-single">${chartCard("learn-modulation-chart", "MOD", modulation.type === "am" ? "包络与拟合" : "瞬时频率与拟合", modulation.type.toUpperCase(), "主曲线 · 拟合", "调制解构曲线")}</div>` : ""}
      ${candidateTable()}
      ${evidenceList()}
    </div>`;
}

function groundTruthFacts(groundTruth) {
  const facts = [];
  const add = (label, value, unit = "") => {
    if (value === null || value === undefined) return;
    facts.push({ label, value: `${formatNumber(value)}${unit}` });
  };
  if (!groundTruth) return facts;
  if (groundTruth.components) {
    for (const component of groundTruth.components) {
      facts.push({ label: "真值分量", value: `${formatNumber(component.frequency)} Hz @ ${formatNumber(component.amplitude)}` });
    }
  }
  add("真频", groundTruth.frequency, " Hz");
  add("幅值", groundTruth.amplitude);
  add("载频", groundTruth.carrierFrequency, " Hz");
  add("调制频率", groundTruth.modulationFrequency, " Hz");
  add("调制指数", groundTruth.modulationIndex);
  add("扫频", groundTruth.startFrequency, " Hz");
  if (groundTruth.startFrequency != null && groundTruth.endFrequency != null) {
    facts.push({ label: "扫频终点", value: `${formatNumber(groundTruth.endFrequency)} Hz` });
  }
  add("噪声 σ", groundTruth.noiseSigma);
  add("采样率", groundTruth.sampleRate, " Hz");
  add("Nyquist", groundTruth.nyquist, " Hz");
  add("样本", groundTruth.sampleCount);
  add("ADC", groundTruth.adcBits, " bit");
  add("抖动", groundTruth.jitterPercent, "%");
  add("削顶", groundTruth.clipLevel);
  if (groundTruth.driftEnd != null) facts.push({ label: "漂移终点", value: `${formatNumber(groundTruth.driftStart ?? 0)} → ${formatNumber(groundTruth.driftEnd)}` });
  return facts;
}

function diagnosisGrid(diagnosis) {
  if (!diagnosis) {
    return `<p class="panel-note">本场景没有数据缺陷需要修复；结论的重点是模型选择与证据边界。</p>`;
  }
  const columns = [
    ["问题", diagnosis.issues],
    ["可能原因", diagnosis.causes],
    ["改进方法", diagnosis.improvements],
  ];
  return `<div class="diagnosis-grid">
    ${columns.map(([title, items]) => `<div class="diagnosis-card"><h4>${title}</h4><ul>${(items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`).join("")}
  </div>`;
}

function aiStatusText() {
  if (!state.ai.health) return "正在检查 AI 服务…";
  if (state.ai.health.configured) return `Qwen 已就绪（${state.ai.health.provider ?? "dashscope"}）· 只发送结构化摘要`;
  if (state.ai.health.health === "not_configured") return "Qwen 密钥未配置，使用本地结构化要点。";
  return "AI 服务不可达，使用本地结构化要点。";
}

function aiPanel() {
  const configured = state.ai.health?.configured === true;
  const loading = state.ai.loading;
  const disabled = !configured || loading || !state.result;
  const buttonLabel = loading ? "解释生成中…" : configured ? "让 Qwen 展开讲解" : "AI 当前不可用";
  const explanation = state.ai.explanation;
  const points = state.scenario.principle?.points ?? [];
  const modelOptions = AI_MODELS.map((model) => `<option value="${model}"${model === state.ai.model ? " selected" : ""}>${model}${model === "qwen-plus" ? "（默认）" : ""}</option>`).join("");
  return `
    <section class="ai-panel" aria-label="AI 深入解释">
      <div class="ai-panel-head">
        <div><span class="eyebrow">05 / EXPLAIN</span><h3>换个角度讲一遍</h3></div>
        <div class="ai-panel-actions">
          <label class="model-picker">模型
            <select id="learn-model-select" aria-label="选择 Qwen 模型">${modelOptions}</select>
          </label>
          <button class="secondary-button" type="button" data-action="ai" ${disabled ? "disabled" : ""}>${buttonLabel}</button>
        </div>
      </div>
      <span class="ai-status">${aiStatusText()}</span>
      ${state.ai.error ? `<p class="ai-fallback-note">${escapeHtml(state.ai.error)}</p>` : ""}
      ${explanation ? `
        <div class="ai-output" aria-live="polite">
          <p>${escapeHtml(explanation.summary)}</p>
          ${(explanation.observations ?? []).length ? `<ul>${explanation.observations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
          ${(explanation.limitations ?? []).length ? `<span class="ai-limit-label">限制</span><ul>${explanation.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        </div>` : ""}
      ${!explanation ? `
        <details class="ai-local">
          <summary>本地结构化要点（不依赖 AI）</summary>
          <ul>${points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
        </details>` : ""}
      <p class="panel-note">AI 只负责解释，不会修改任何数值或可信等级；发送内容不含原始序列。</p>
    </section>`;
}

function concludePanel() {
  const { scenario, result } = state;
  const checks = buildChecks();
  const passed = checks.filter((check) => check.ok).length;
  const truth = groundTruthFacts(scenario.groundTruth);
  const conclusion = result.unknown
    ? `证据不足：系统拒绝给出参数结论，可信等级为「${result.reliability.label}」。这比强行给出一个拟合参数更诚实。`
    : `系统推荐「${result.best?.label ?? "—"}」，可信等级为「${result.reliability.label}」，数据体检${HEALTH_LABELS[result.health.status] ?? result.health.status}。`;
  return `
    <div class="step-panel">
      <div class="verdict-card">
        <div class="verdict-head">
          <div><span class="eyebrow">04 / CONCLUDE</span><h3>写出有边界的结论</h3></div>
          <span class="reliability-badge ${result.reliability.level === "reliable" ? "" : result.reliability.level === "insufficient_evidence" ? "insufficient" : result.reliability.level}">${escapeHtml(result.reliability.label)}</span>
        </div>
        <p class="panel-lede">${escapeHtml(conclusion)}</p>
        <div class="fact-strip">
          <span class="fact">与标准结论 <b>${state.match.ok ? "一致" : "存在差异"}</b></span>
          <span class="fact">核对 <b>${passed} / ${checks.length}</b></span>
          <span class="fact">BIC 差距 <b>${formatNumber(result.reliability.bicGap)}</b></span>
        </div>
      </div>
      ${truth.length ? `<div class="panel-card">
        <div class="card-head"><div><span>GROUND TRUTH</span><h3>生成这个场景时的真值</h3></div><small>仅学习页可见</small></div>
        <div class="fact-strip">${truth.map((fact) => `<span class="fact">${escapeHtml(fact.label)} <b>${escapeHtml(fact.value)}</b></span>`).join("")}</div>
        <p class="panel-note">真值用于对照估计结果。注意：分析器并不知道真值，它只看到时域样本。</p>
      </div>` : ""}
      <div class="panel-card">
        <div class="card-head"><div><span>TAKEAWAYS</span><h3>本场景要记住什么</h3></div><small>${(scenario.principle?.points ?? []).length} 条</small></div>
        <ul class="points-list">${(scenario.principle?.points ?? []).map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
      </div>
      <div class="panel-card">
        <div class="card-head"><div><span>DIAGNOSIS</span><h3>如果这是你的实验</h3></div><small>问题 · 原因 · 改法</small></div>
        ${diagnosisGrid(scenario.diagnosis)}
      </div>
      <div class="panel-card">
        <div class="card-head"><div><span>THINK</span><h3>带着问题离开</h3></div><small>自测</small></div>
        <ol class="questions-list">
          ${(scenario.questions ?? []).map((question, index) => `<li><span class="q-no">${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(question)}</p></li>`).join("")}
        </ol>
      </div>
      ${aiPanel()}
    </div>`;
}

function stepPanel() {
  if (state.stepIndex === 0) return observePanel();
  if (state.stepIndex === 1) return hypothesizePanel();
  if (state.stepIndex === 2) return verifyPanel();
  return concludePanel();
}

function footer() {
  const last = state.stepIndex === 3;
  const learned = Boolean(progress.learned[state.scenarioId]);
  const upcoming = nextScenario();
  const nextDisabled = state.stepIndex === 2 && !state.resultRevealed;
  return `
    <div class="lesson-actions">
      <div class="lesson-actions-group">
        ${state.stepIndex > 0 ? '<button class="ghost-button" type="button" data-action="prev">← 上一步</button>' : ""}
        ${learned ? '<span class="lesson-complete">✓ 已完成本课</span>' : ""}
      </div>
      <div class="lesson-actions-group">
        ${last
          ? `<button class="ghost-button" type="button" data-action="replay">重做本课</button>
             ${upcoming
               ? `<button class="lesson-next" type="button" data-action="next-scenario">下一场景：${escapeHtml(upcoming.title)} →</button>`
               : '<span class="panel-note">已是最后一个场景</span>'}`
          : `<button class="lesson-next" type="button" data-action="next" ${nextDisabled ? "disabled" : ""}>下一步：${STEPS[state.stepIndex + 1].label} →</button>`}
      </div>
    </div>`;
}

function scenarioOptions() {
  return CATEGORIES.map((category) => {
    const items = catalog.filter((scenario) => scenario.category === category);
    if (!items.length) return "";
    return `<optgroup label="${escapeHtml(CATEGORY_META[category]?.label ?? category)}">${items.map((scenario) => `<option value="${escapeHtml(scenario.id)}"${scenario.id === state.scenarioId ? " selected" : ""}>${escapeHtml(scenario.title)}</option>`).join("")}</optgroup>`;
  }).join("");
}

function renderLesson() {
  if (!state.scenario) {
    elements.lessonEmpty.hidden = false;
    elements.lessonContent.hidden = true;
    elements.lessonContent.innerHTML = "";
    return;
  }
  const scenario = state.scenario;
  const meta = CATEGORY_META[scenario.category] ?? { chip: scenario.category };
  const dots = [1, 2, 3].map((level) => `<i class="${level <= scenario.difficulty ? "on" : ""}"></i>`).join("");
  elements.lessonEmpty.hidden = true;
  elements.lessonContent.hidden = false;
  elements.lessonContent.innerHTML = `
    <header class="lesson-head">
      <div class="lesson-title">
        <span class="eyebrow">SCENARIO / ${escapeHtml(scenario.id)}</span>
        <h2>${escapeHtml(scenario.title)}</h2>
        <p class="lesson-summary">${escapeHtml(scenario.summary)}</p>
      </div>
      <div class="lesson-tools">
        <label class="lesson-picker">切换场景
          <select id="learn-scenario-select" aria-label="切换学习场景">${scenarioOptions()}</select>
        </label>
        <div class="lesson-badges">
          <span class="category-chip" data-category="${escapeHtml(scenario.category)}">${escapeHtml(meta.chip)}</span>
          <span class="difficulty" role="img" aria-label="难度 ${scenario.difficulty} / 3">${dots}</span>
        </div>
      </div>
    </header>
    ${stepTrack()}
    ${stepPanel()}
    ${footer()}`;
  requestAnimationFrame(redrawCharts);
}

/* ---- charts ---- */

function timeWindow() {
  const data = state.data;
  if (!data) return { time: [], observed: [], fitted: [], q: [] };
  const count = data.time.length;
  const sampleRate = state.result?.sampleRate ?? count;
  const truth = state.scenario?.groundTruth ?? {};
  const fullRecord = state.scenario?.category === "defect"
    || state.scenario?.category === "out-of-library"
    || truth.driftEnd != null;
  let windowCount = count;
  if (!fullRecord) {
    const seconds = truth.modulationFrequency ? Math.max(0.12, 2.5 / truth.modulationFrequency) : 0.12;
    windowCount = Math.min(count, Math.max(64, Math.round(sampleRate * seconds)));
  }
  const revealed = state.resultRevealed;
  const time = data.time.slice(0, windowCount);
  const observed = ((revealed ? state.result?.series?.observed : null) ?? (data.kind === "iq" ? data.i : data.values)).slice(0, windowCount);
  const fitted = (revealed ? state.result?.series?.fitted ?? [] : []).slice(0, windowCount);
  const q = data.kind === "iq"
    ? ((revealed ? state.result?.iq?.q : null) ?? data.q).slice(0, windowCount)
    : [];
  return { time, observed, fitted, q };
}

function drawTimeChart(canvas) {
  const { time, observed, fitted, q } = timeWindow();
  if (!time.length || !observed.length) return;
  const lines = [{ values: observed, color: "cyan", width: 1 }];
  if (fitted.length === time.length) lines.push({ values: fitted, color: "warn", width: 1.4 });
  else if (q.length === time.length) lines.push({ values: q, color: "warn", width: 1 });
  drawPlot(canvas, time, lines, { xLabel: "time / s", yLabel: "amplitude" });
}

function drawSpectrumChart(canvas) {
  const spectrum = state.result?.spectrum;
  if (!spectrum?.frequencies?.length) return;
  const max = spectrumMax();
  let end = spectrum.frequencies.findIndex((frequency) => frequency > max);
  if (end === -1) end = spectrum.frequencies.length;
  drawPlot(canvas, spectrum.frequencies.slice(0, end), [{ values: spectrum.amplitudes.slice(0, end), color: "cyan", width: 1 }], {
    fill: true,
    xLabel: "frequency / Hz",
    yLabel: "amplitude",
  });
}

function drawModulationChart(canvas) {
  const view = state.result?.best?.modulationView;
  if (!view?.time?.length) return;
  drawPlot(canvas, view.time, [
    { values: view.primary, color: "cyan", width: 1 },
    { values: view.fitted, color: "warn", width: 1.4 },
  ], { xLabel: "time / s", yLabel: view.type === "am" ? "envelope" : "frequency" });
}

function redrawCharts() {
  const timeCanvas = document.getElementById("learn-time-chart");
  if (timeCanvas) drawTimeChart(timeCanvas);
  const spectrumCanvas = document.getElementById("learn-spectrum-chart");
  if (spectrumCanvas) drawSpectrumChart(spectrumCanvas);
  const modulationCanvas = document.getElementById("learn-modulation-chart");
  if (modulationCanvas) drawModulationChart(modulationCanvas);
}

/* ---- AI ---- */

async function runAi() {
  if (!state.result || state.ai.loading) return;
  const model = state.ai.model;
  const cached = state.ai.cache[model];
  if (cached) {
    state.ai.explanation = cached;
    state.ai.error = null;
    renderLesson();
    return;
  }
  state.ai.loading = true;
  state.ai.error = null;
  renderLesson();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const explanation = await fetchLearnExplanation(buildLearnPayload(state.scenario, state.result), model, controller.signal);
    state.ai.cache[model] = explanation;
    state.ai.explanation = explanation;
  } catch (error) {
    state.ai.explanation = null;
    state.ai.error = error.name === "AbortError" ? "AI 解释超时，已回退到本地要点。" : (error.message || "AI 解释失败，已回退到本地要点。");
  } finally {
    clearTimeout(timeout);
    state.ai.loading = false;
    renderLesson();
  }
}

async function checkAiHealth() {
  const health = await fetchAiHealth();
  state.ai.health = health;
  if (state.stepIndex === 3 && state.scenario) renderLesson();
}

/* ---- events ---- */

function bindEvents() {
  elements.scenarioList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-scenario]");
    if (card) openScenario(card.dataset.scenario);
  });

  elements.lesson.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (action) {
      switch (action.dataset.action) {
        case "prev":
          goToStep(state.stepIndex - 1);
          break;
        case "next":
          advanceStep();
          break;
        case "verify":
          state.resultRevealed = true;
          state.maxStep = Math.max(state.maxStep, 3);
          renderLesson();
          break;
        case "replay":
          state.stepIndex = 0;
          state.maxStep = 0;
          state.resultRevealed = false;
          state.evidenceOpen = null;
          state.ai.explanation = null;
          state.ai.error = null;
          state.ai.loading = false;
          progress.lastStep = 0;
          saveProgress();
          renderLesson();
          scrollToLesson();
          break;
        case "next-scenario": {
          const upcoming = nextScenario();
          if (upcoming) openScenario(upcoming.id);
          break;
        }
        case "ai":
          runAi();
          break;
        default:
          break;
      }
      return;
    }
    const evidence = event.target.closest("[data-evidence-id]");
    if (evidence) {
      const id = evidence.dataset.evidenceId;
      state.evidenceOpen = state.evidenceOpen === id ? null : id;
      renderLesson();
      return;
    }
    const step = event.target.closest("[data-step-index]");
    if (step) goToStep(Number(step.dataset.stepIndex));
  });

  elements.lesson.addEventListener("change", (event) => {
    if (event.target.id === "learn-scenario-select") {
      openScenario(event.target.value);
      return;
    }
    if (event.target.id !== "learn-model-select") return;
    state.ai.model = event.target.value;
    state.ai.explanation = state.ai.cache[state.ai.model] ?? null;
    state.ai.error = null;
    renderLesson();
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redrawCharts, 140);
  });
}

function init() {
  initTheme();
  catalog = listScenarios();
  progress = loadProgress();
  bindEvents();
  updateProgressUi();
  renderCatalog();
  const initial = catalog.find((scenario) => scenario.id === progress.lastScenario) ?? catalog[0];
  if (initial) openScenario(initial.id, { scroll: false });
  checkAiHealth();
}

init();
