import {
  buildAiPayload,
  buildDecision,
  buildExperimentPlan,
  templateExplanation,
} from "./dsp.js?v=12";
import { parseCsv } from "./csv.js?v=12";
import { parseMat } from "./mat.js?v=12";
import { drawPlot } from "./charts.js?v=12";
import {
  analyzeSignalSafely,
  analyzeIqSafely,
  stressTestSafely,
  fetchAiHealth,
  fetchExplanation,
  buildReport,
  getHistory,
  addHistory,
  clearHistoryStorage,
} from "./service.js?v=12";

const elements = {
  tabs: [...document.querySelectorAll(".source-tab")],
  file: document.querySelector("#csv-file"),
  matFile: document.querySelector("#mat-file"),
  matRate: document.querySelector("#mat-rate"),
  mapping: document.querySelector("#mapping-panel"),
  csvPreview: document.querySelector("#csv-preview"),
  timeColumn: document.querySelector("#time-column"),
  signalColumn: document.querySelector("#signal-column"),
  iqMode: document.querySelector("#iq-mode"),
  qColumnWrap: document.querySelector("#q-column-wrap"),
  qColumn: document.querySelector("#q-column"),
  analyze: document.querySelector("#analyze-button"),
  download: document.querySelector("#download-button"),
  recommendation: document.querySelector("#recommended-model"),
  reliability: document.querySelector("#reliability-badge"),
  subtitle: document.querySelector("#result-subtitle"),
  conclusionTitle: document.querySelector("#conclusion-title"),
  conclusionConfidence: document.querySelector("#conclusion-confidence"),
  conclusionSummary: document.querySelector("#conclusion-summary"),
  conclusionEvidence: document.querySelector("#conclusion-evidence"),
  conclusionChange: document.querySelector("#conclusion-change"),
  healthStatus: document.querySelector("#health-status"),
  healthList: document.querySelector("#health-list"),
  designList: document.querySelector("#design-list"),
  healthTipList: document.querySelector("#health-tip-list"),
  designTipList: document.querySelector("#design-tip-list"),
  designTipSummary: document.querySelector("#design-tip-summary"),
  modulationLab: document.querySelector("#modulation-lab"),
  modulationType: document.querySelector("#modulation-type"),
  modulationChart: document.querySelector("#modulation-chart"),
  modulationFacts: document.querySelector("#modulation-facts"),
  modulationSidebands: document.querySelector("#modulation-sidebands"),
  stressButton: document.querySelector("#stress-button"),
  stressList: document.querySelector("#stress-list"),
  channelCard: document.querySelector("#channel-card"),
  channelButton: document.querySelector("#channel-button"),
  channelSummary: document.querySelector("#channel-summary"),
  channelList: document.querySelector("#channel-list"),
  metricSamples: document.querySelector("#metric-samples"),
  metricRate: document.querySelector("#metric-rate"),
  metricR2: document.querySelector("#metric-r2"),
  metricRmse: document.querySelector("#metric-rmse"),
  metricGap: document.querySelector("#metric-gap"),
  metricResolution: document.querySelector("#metric-resolution"),
  metricDuration: document.querySelector("#metric-duration"),
  timeChart: document.querySelector("#time-chart"),
  spectrumChart: document.querySelector("#spectrum-chart"),
  residualChart: document.querySelector("#residual-chart"),
  candidateBody: document.querySelector("#candidate-body"),
  parameterBody: document.querySelector("#parameter-body"),
  evidenceList: document.querySelector("#evidence-list"),
  limitationList: document.querySelector("#limitation-list"),
  nextStepList: document.querySelector("#next-step-list"),
  aiSummary: document.querySelector("#ai-summary"),
  aiObservations: document.querySelector("#ai-observations"),
  aiLimitations: document.querySelector("#ai-limitations"),
  aiButton: document.querySelector("#ai-button"),
  aiStatus: document.querySelector("#ai-status"),
  modelSelect: document.querySelector("#model-select"),
  timeLegend: document.querySelector("#time-legend"),
  toast: document.querySelector("#toast"),
  themeToggle: document.querySelector("#theme-toggle"),
  resultAnnouncer: document.querySelector("#result-announcer"),
  historyList: document.querySelector("#history-list"),
  historyDetail: document.querySelector("#history-detail"),
  historyClear: document.querySelector("#history-clear"),
};

const state = {
  data: null,
  sourceLabel: "内置单频样例",
  uploadedColumns: null,
  result: null,
  busy: false,
  aiConfigured: false,
  aiHealth: "checking",
  dataVersion: 0,
  resultVersion: -1,
  resultStale: false,
  aiRequestSequence: 0,
  lastData: null,
  channelResults: null,
  channelBusy: false,
  inputMode: "real",
  history: [],
};

const AI_CACHE_LIMIT = 20;
const aiCache = new Map();
const THEME_KEY = "signalinsight.theme";

let toastTimer = null;

function showToast(message, error = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", error);
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3600);
}

function applyTheme(theme, { persist = true } = {}) {
  const light = theme === "light";
  document.documentElement.dataset.theme = light ? "light" : "dark";
  if (persist) {
    try { localStorage.setItem(THEME_KEY, light ? "light" : "dark"); } catch { /* storage unavailable */ }
  }
  const toggle = elements.themeToggle;
  if (toggle) {
    toggle.dataset.target = light ? "dark" : "light";
    toggle.textContent = light ? "深色" : "浅色";
    toggle.setAttribute("aria-label", light ? "切换到深色模式" : "切换到浅色模式");
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = light ? "#f2f7f3" : "#0b1718";
  if (state.result) {
    requestAnimationFrame(() => {
      renderCharts(state.result);
      if (state.result.best?.modulationView) drawModulationChart(state.result);
    });
  }
}

function initTheme() {
  let saved = "dark";
  try { saved = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark"; } catch { /* storage unavailable */ }
  applyTheme(saved, { persist: false });
  elements.themeToggle?.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  });
}

function formatNumber(value, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(3);
  }
  return value.toFixed(digits);
}

function createRandom(seed) {
  let stateValue = seed >>> 0;
  return () => {
    stateValue += 0x6d2b79f5;
    let t = stateValue;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function buildExample(kind) {
  const sampleRate = 1024;
  const sampleCount = 2048;
  const time = Array.from({ length: sampleCount }, (_, index) => index / sampleRate);
  const random = createRandom(42);
  const definitions = {
    single: {
      label: "内置单频样例 · 93.7 Hz",
      components: [{ amplitude: 2, frequency: 93.7, phase: 0.4 }],
      noise: 0.035,
      offset: 0.12,
    },
    dual: {
      label: "内置双频样例 · 80.5 / 173.2 Hz",
      components: [
        { amplitude: 1.25, frequency: 80.5, phase: 0.1 },
        { amplitude: 0.7, frequency: 173.2, phase: -0.5 },
      ],
      noise: 0.025,
      offset: 0.05,
    },
    noise: {
      label: "库外噪声 · 无候选模型",
      components: [],
      noise: 1,
      offset: 0,
    },
  };
  const definition = definitions[kind];
  const values = time.map((t) => {
    let value = definition.offset;
    for (const component of definition.components) {
      value += component.amplitude * Math.sin(2 * Math.PI * component.frequency * t + component.phase);
    }
    return value + definition.noise * gaussian(random);
  });
  return { time, values, label: definition.label };
}

function renderCsvPreview(parsed, filename) {
  const table = document.createElement("table");
  const previewRows = parsed.previewRows ?? parsed.rows;
  const rowCount = parsed.rowCount ?? parsed.rows.length;
  const caption = table.createCaption();
  caption.textContent = `${filename} · 预览前 ${Math.min(3, previewRows.length)} 行 · 共 ${rowCount} 行`;
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const header of parsed.headers) {
    const th = document.createElement("th");
    th.textContent = header;
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = document.createElement("tbody");
  for (const row of previewRows.slice(0, 3)) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  elements.csvPreview.replaceChildren(table);
  elements.csvPreview.hidden = false;
}

function matToParsed(variable, sampleRate) {
  if (variable.complex || variable.imaginary) {
    throw new Error("MAT 复数矩阵请改用 IQ CSV；当前 MAT 导入仅支持实数矩阵。");
  }
  const rows = variable.values;
  const timeColumn = {
    header: "time",
    values: variable.cols === 1 ? rows.map((_, index) => index / sampleRate) : rows.map((row) => row[0]),
  };
  const signalColumns = [];
  if (variable.cols === 1) {
    signalColumns.push({ header: variable.name || "signal", values: rows.map((row) => row[0]) });
  } else {
    for (let column = 1; column < variable.cols; column += 1) {
      signalColumns.push({
        header: `${variable.name || "signal"}_${column}`,
        values: rows.map((row) => row[column]),
      });
    }
  }
  if (!signalColumns.length) throw new Error("MAT 至少需要一列信号。");
  return {
    headers: [timeColumn.header, ...signalColumns.map((column) => column.header)],
    rows: [],
    previewRows: rows.slice(0, 3).map((row, index) => [
      timeColumn.values[index],
      ...signalColumns.map((column) => column.values[index]),
    ]),
    rowCount: rows.length,
    numericColumns: [timeColumn, ...signalColumns],
    timeCandidate: timeColumn,
    signalCandidate: signalColumns[0],
  };
}

function populateMapping(parsed, filename) {
  const options = parsed.numericColumns
    .map((column) => `<option value="${escapeHtml(column.header)}">${escapeHtml(column.header)}</option>`)
    .join("");
  elements.timeColumn.innerHTML = options;
  elements.signalColumn.innerHTML = options;
  elements.qColumn.innerHTML = options;
  elements.timeColumn.value = parsed.timeCandidate.header;
  elements.signalColumn.value = parsed.signalCandidate.header;
  elements.qColumn.value = parsed.signalCandidate.header;
  const findByHeader = (pattern) => parsed.numericColumns.find((column) => pattern.test(column.header));
  const iColumn = findByHeader(/^i([_\s-]|$)/i);
  const qColumn = findByHeader(/^q([_\s-]|$)/i);
  const iqAvailable = Boolean(
    iColumn && qColumn &&
    iColumn.header !== qColumn.header &&
    iColumn.header !== parsed.timeCandidate.header &&
    qColumn.header !== parsed.timeCandidate.header,
  );
  elements.iqMode.checked = iqAvailable;
  elements.qColumnWrap.hidden = !iqAvailable;
  if (iqAvailable) {
    elements.signalColumn.value = iColumn.header;
    elements.qColumn.value = qColumn.header;
  }
  state.inputMode = iqAvailable ? "iq" : "real";
  elements.mapping.hidden = false;
  renderCsvPreview(parsed, filename);
  state.uploadedColumns = parsed.numericColumns;
  state.sourceLabel = `上传数据 · ${filename}`;
  markDataChanged("CSV 已载入，请确认字段映射后运行分析。");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function selectedSignal() {
  if (!state.uploadedColumns) return state.data;
  const timeHeader = elements.timeColumn.value;
  if (state.inputMode === "iq") {
    const iHeader = elements.signalColumn.value;
    const qHeader = elements.qColumn.value;
    if (new Set([timeHeader, iHeader, qHeader]).size < 3) {
      throw new Error("时间、I、Q 列必须互不相同。");
    }
    const timeColumn = state.uploadedColumns.find((column) => column.header === timeHeader);
    const iColumn = state.uploadedColumns.find((column) => column.header === iHeader);
    const qColumn = state.uploadedColumns.find((column) => column.header === qHeader);
    if (!timeColumn || !iColumn || !qColumn) throw new Error("IQ 字段映射无效。");
    return {
      kind: "iq",
      time: timeColumn.values,
      i: iColumn.values,
      q: qColumn.values,
      label: `${state.sourceLabel} · IQ 时间 ${timeHeader} / I ${iHeader} / Q ${qHeader}`,
    };
  }
  const signalHeader = elements.signalColumn.value;
  if (timeHeader === signalHeader) throw new Error("时间列与信号列不能相同。");
  const timeColumn = state.uploadedColumns.find((column) => column.header === timeHeader);
  const signalColumn = state.uploadedColumns.find((column) => column.header === signalHeader);
  if (!timeColumn || !signalColumn) throw new Error("字段映射无效。");
  return {
    kind: "real",
    time: timeColumn.values,
    values: signalColumn.values,
    label: `${state.sourceLabel} · 时间 ${timeHeader} / 信号 ${signalHeader}`,
  };
}

function signalColumns() {
  if (!state.uploadedColumns) return [];
  const timeHeader = elements.timeColumn.value;
  return state.uploadedColumns.filter((column) => column.header !== timeHeader);
}

function updateChannelCard() {
  const columns = signalColumns();
  const available = Boolean(state.uploadedColumns) && columns.length >= 2 && state.inputMode !== "iq";
  elements.channelCard.hidden = !available;
  if (!available) {
    elements.channelButton.disabled = true;
    elements.channelList.replaceChildren();
    elements.channelSummary.textContent = "检测到多个信号列后可批量分析；每个通道独立建模。";
    return;
  }
  elements.channelButton.disabled = state.channelBusy;
  if (!state.channelBusy && !state.channelResults) {
    elements.channelSummary.textContent = `检测到 ${columns.length} 个信号列；逐通道独立分析，不做通道间联合模型。`;
  }
}

function renderChannelResults(results) {
  elements.channelList.replaceChildren(...results.map((entry) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "channel-row";
    const name = document.createElement("strong");
    name.textContent = entry.column;
    const detail = document.createElement("span");
    detail.textContent = entry.error
      ? `失败：${entry.error}`
      : `${entry.model} · ${entry.reliability} · ${entry.r2 == null ? "—" : `R² ${entry.r2.toFixed(4)}`}`;
    const badge = document.createElement("span");
    badge.className = `channel-badge${entry.model === "unknown" || entry.error ? " muted" : ""}`;
    badge.textContent = entry.error ? "失败" : entry.model === "unknown" ? "未知" : "完成";
    row.append(name, detail, badge);
    if (!entry.error) {
      row.addEventListener("click", () => {
        elements.signalColumn.value = entry.column;
        elements.signalColumn.dispatchEvent(new Event("change", { bubbles: true }));
        analyzeCurrent();
      });
    }
    return row;
  }));
}

async function analyzeAllChannels() {
  if (!state.uploadedColumns || state.channelBusy || state.inputMode === "iq") return;
  const columns = signalColumns();
  if (columns.length < 2) return;
  const selected = columns.slice(0, 8);
  const timeHeader = elements.timeColumn.value;
  const timeColumn = state.uploadedColumns.find((column) => column.header === timeHeader);
  if (!timeColumn) return;
  const version = state.dataVersion;
  state.channelBusy = true;
  elements.channelButton.disabled = true;
  elements.channelList.replaceChildren();
  elements.channelSummary.textContent = `正在逐通道分析 0/${selected.length}…`;
  const results = [];
  try {
    for (let index = 0; index < selected.length; index += 1) {
      if (version !== state.dataVersion) return;
      const column = selected[index];
      try {
        const result = await analyzeSignalSafely(timeColumn.values, column.values);
        results.push({
          column: column.header,
          model: result.unknown ? "unknown" : result.best?.label ?? "unknown",
          reliability: result.reliability.label,
          r2: result.best?.metrics.r2 ?? null,
        });
      } catch (error) {
        results.push({
          column: column.header,
          error: error instanceof Error ? error.message : "分析失败",
        });
      }
      elements.channelSummary.textContent = `正在逐通道分析 ${index + 1}/${selected.length}…`;
    }
    if (version !== state.dataVersion) return;
    state.channelResults = results;
    renderChannelResults(results);
    elements.channelSummary.textContent = `已分析 ${results.length} 个通道；逐通道独立分析，不做通道间联合模型。`;
  } finally {
    state.channelBusy = false;
    updateChannelCard();
  }
}

let analysisSequence = 0;

function invalidateResult(message = "数据已变更，请重新运行分析。") {
  state.resultStale = true;
  state.resultVersion = -1;
  state.aiRequestSequence += 1;
  elements.download.disabled = true;
  elements.aiButton.disabled = true;
  elements.aiButton.textContent = "请先运行分析";
  elements.aiStatus.textContent = message;
  elements.aiSummary.textContent = "数据已变更，等待重新分析。";
  elements.aiObservations.replaceChildren();
  elements.aiLimitations.hidden = true;
  elements.subtitle.textContent = message;
  elements.resultAnnouncer.textContent = message;
  elements.conclusionTitle.textContent = "等待重新分析";
  elements.conclusionConfidence.textContent = "—";
  elements.conclusionSummary.textContent = message;
  elements.conclusionEvidence.replaceChildren();
  elements.conclusionChange.replaceChildren();
  elements.healthStatus.textContent = "—";
  elements.healthStatus.className = "health-status";
  elements.healthList.replaceChildren();
  elements.designList.replaceChildren();
  elements.modulationLab.hidden = true;
  elements.modulationFacts.replaceChildren();
  elements.modulationSidebands.replaceChildren();
  elements.stressButton.disabled = true;
  elements.stressButton.textContent = "运行反事实测试";
  elements.stressList.replaceChildren();
  window.SignalInsightLayout?.syncConditional?.();
}

function markDataChanged(message) {
  state.dataVersion += 1;
  state.channelResults = null;
  elements.channelList.replaceChildren();
  invalidateResult(message);
  updateChannelCard();
}

function setBusy(busy) {
  state.busy = busy;
  elements.analyze.disabled = busy;
  elements.analyze.querySelector("span").textContent = busy ? "正在拟合与比较…" : "运行可信分析";
}

async function analyzeCurrent() {
  const sequence = ++analysisSequence;
  const version = state.dataVersion;
  try {
    setBusy(true);
    elements.download.disabled = true;
    elements.aiButton.disabled = true;
    elements.aiButton.textContent = "分析中…";
    elements.aiStatus.textContent = "等待当前分析完成。";
    elements.conclusionTitle.textContent = "正在分析…";
    elements.conclusionConfidence.textContent = "—";
    elements.conclusionSummary.textContent = "Worker 正在做模型竞争与证据检查。";
    elements.conclusionEvidence.replaceChildren();
    elements.conclusionChange.replaceChildren();
    elements.healthStatus.textContent = "检查中…";
    elements.healthStatus.className = "health-status";
    elements.healthList.replaceChildren();
    elements.designList.replaceChildren();
    elements.modulationLab.hidden = true;
    elements.modulationFacts.replaceChildren();
    elements.modulationSidebands.replaceChildren();
    elements.stressButton.disabled = true;
    elements.stressButton.textContent = "运行反事实测试";
    elements.stressList.replaceChildren();
    const data = selectedSignal();
    const sampleLength = data.kind === "iq" ? data.i.length : data.values.length;
    if (sampleLength > 100000) {
      showToast("大样本分析已转入 Worker，可能需要数十秒。");
    }
    const started = performance.now();
    const result = data.kind === "iq"
      ? await analyzeIqSafely(data.time, data.i, data.q)
      : await analyzeSignalSafely(data.time, data.values);
    if (sequence !== analysisSequence || version !== state.dataVersion) return;
    result.elapsedMs = performance.now() - started;
    state.result = result;
    state.resultVersion = version;
    state.resultStale = false;
    state.lastData = data.kind === "iq"
      ? { kind: "iq", time: data.time, i: data.i, q: data.q }
      : { kind: "real", time: data.time, values: data.values };
    state.sourceLabel = data.label;
    render(result);
    saveHistory(result, state.sourceLabel);
    showToast(`分析完成 · ${Math.round(result.elapsedMs)} ms · ${result.engine === "worker" ? "Worker" : "主线程"} · ${data.label}`);
  } catch (error) {
    if (sequence === analysisSequence) {
      invalidateResult("分析失败；请检查数据后重试。");
      showToast(error instanceof Error ? error.message : "分析失败。", true);
    }
  } finally {
    if (sequence === analysisSequence) setBusy(false);
  }
}

const EVIDENCE_CHARTS = {
  spectral_prominence: "spectrum-chart",
  residual_structure: "residual-chart",
  residual_whiteness: "residual-chart",
  fit_quality: "time-chart",
  frequency_resolution: "time-chart",
  modulation_structure: "time-chart",
};

function focusEvidence(id) {
  const row = document.querySelector(`[data-evidence-id="${id}"]`);
  if (row) {
    row.classList.add("evidence-flash");
    setTimeout(() => row.classList.remove("evidence-flash"), 1800);
  }
  const chartId = EVIDENCE_CHARTS[id];
  if (chartId) {
    const tile = document.getElementById(chartId)?.closest(".tile");
    if (tile) window.SignalInsightLayout?.ensure?.(tile.dataset.module);
  }
  const card = chartId ? document.getElementById(chartId)?.closest(".chart-card") : null;
  if (card) {
    card.classList.add("chart-flash");
    setTimeout(() => card.classList.remove("chart-flash"), 1800);
  }
}

function renderConclusion(result) {
  const decision = buildDecision(result);
  elements.conclusionTitle.textContent = decision.title;
  elements.conclusionConfidence.textContent = decision.confidence;
  elements.conclusionSummary.textContent = decision.summary;
  const chips = decision.evidenceIds.map((id) => {
    const item = result.reliability.evidence.find((entry) => entry.id === id);
    if (!item) return null;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `evidence-chip ${item.status}`;
    chip.textContent = `${item.label} · ${item.value}`;
    chip.addEventListener("click", () => focusEvidence(item.id));
    return chip;
  }).filter(Boolean);
  elements.conclusionEvidence.replaceChildren(...chips);
  elements.conclusionChange.replaceChildren(...decision.whatWouldChange.map((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  }));
}

function renderHealth(result) {
  const health = result.health;
  const status = health?.status ?? "warn";
  elements.healthStatus.textContent = status === "ok" ? "通过" : status === "warn" ? "有警告" : "有异常";
  elements.healthStatus.className = `health-status ${status}`;
  const healthRows = (health?.checks ?? []).map((check) => {
    const row = document.createElement("div");
    row.className = "health-item";
    const dot = document.createElement("span");
    dot.className = `evidence-dot ${check.status === "pass" ? "" : check.status}`;
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = check.label;
    const detail = document.createElement("small");
    detail.textContent = check.detail;
    copy.append(title, detail);
    row.append(dot, copy);
    return row;
  });
  elements.healthList.replaceChildren(...healthRows);

  const tipRow = (status, label, detail, meta) => {
    const item = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = `evidence-dot ${status === "pass" ? "" : status}`;
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = label;
    copy.append(title);
    if (detail) {
      const note = document.createElement("small");
      note.textContent = detail;
      copy.append(note);
    }
    if (meta) {
      const value = document.createElement("span");
      value.className = "tip-value";
      value.textContent = meta;
      copy.append(value);
    }
    item.append(dot, copy);
    return item;
  };
  const checkStatus = { pass: "通过", warn: "警告", fail: "异常" };
  elements.healthTipList.replaceChildren(...(health?.checks ?? []).map((check) => (
    tipRow(check.status, check.label, check.detail, checkStatus[check.status] ?? check.status)
  )));

  const plan = buildExperimentPlan(result);
  elements.designTipSummary.textContent = plan.summary;
  elements.designTipList.replaceChildren(...plan.items.map((item) => (
    tipRow(item.status, item.label, item.detail, `${item.value} · ${item.status === "pass" ? "已满足" : "待处理"}`)
  )));
  const summary = document.createElement("p");
  summary.className = "design-summary";
  summary.textContent = plan.summary;
  const designRows = plan.items.map((item) => {
    const row = document.createElement("div");
    row.className = `design-item ${item.status}`;
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.label;
    const detail = document.createElement("small");
    detail.textContent = item.detail;
    copy.append(title, detail);
    const value = document.createElement("span");
    value.textContent = item.value;
    row.append(copy, value);
    return row;
  });
  elements.designList.replaceChildren(summary, ...designRows);
}

function drawModulationChart(result) {
  const view = result.best?.modulationView;
  if (!view) return;
  drawPlot(
    elements.modulationChart,
    view.time,
    [
      { values: view.primary, color: "cyan", width: 1 },
      { values: view.fitted, color: "warn", width: 1.4 },
    ],
    { xLabel: "time / s", yLabel: view.type === "am" ? "envelope" : "inst. freq / Hz" },
  );
}

function renderModulation(result) {
  const view = result.best?.modulationView;
  if (!view || !["am", "fm"].includes(result.best?.family)) {
    elements.modulationLab.hidden = true;
    elements.modulationFacts.replaceChildren();
    elements.modulationSidebands.replaceChildren();
    return;
  }
  elements.modulationLab.hidden = false;
  elements.modulationType.textContent = `${view.type.toUpperCase()} · ${view.carrierFrequency.toFixed(2)} Hz`;
  const facts = view.type === "am"
    ? [
        ["载频", `${view.carrierFrequency.toFixed(3)} Hz`],
        ["调制频率", `${view.modulationFrequency.toFixed(3)} Hz`],
        ["调制指数", view.modulationIndex.toFixed(3)],
        ["载波幅值", `${view.carrierAmplitude.toFixed(3)} a.u.`],
      ]
    : [
        ["载频", `${view.carrierFrequency.toFixed(3)} Hz`],
        ["调制频率", `${view.modulationFrequency.toFixed(3)} Hz`],
        ["频偏", `${view.frequencyDeviation.toFixed(3)} Hz`],
        ["调制指数", view.modulationIndex.toFixed(3)],
      ];
  elements.modulationFacts.replaceChildren(...facts.map(([label, value]) => {
    const row = document.createElement("div");
    row.className = "modulation-fact";
    const title = document.createElement("span");
    title.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    row.append(title, strong);
    return row;
  }));
  const maxAmplitude = Math.max(...view.sidebands.map((sideband) => sideband.amplitude), 1e-12);
  elements.modulationSidebands.replaceChildren(...view.sidebands.map((sideband) => {
    const row = document.createElement("div");
    row.className = "modulation-sideband";
    const label = document.createElement("span");
    label.textContent = `${sideband.frequency.toFixed(3)} Hz`;
    const value = document.createElement("strong");
    value.textContent = sideband.amplitude.toFixed(3);
    const bar = document.createElement("i");
    bar.style.width = `${Math.max(2, (sideband.amplitude / maxAmplitude) * 100)}%`;
    row.append(label, value, bar);
    return row;
  }));
  requestAnimationFrame(() => drawModulationChart(result));
}

function renderStress(result) {
  const summary = document.createElement("p");
  summary.className = "stress-verdict";
  summary.textContent = result.summary;
  elements.stressList.replaceChildren(summary, ...result.variants.map((variant) => {
    const row = document.createElement("div");
    row.className = `stress-item${variant.flipped ? " flip" : ""}`;
    const title = document.createElement("strong");
    title.textContent = variant.label;
    const model = document.createElement("span");
    model.textContent = variant.error
      ? `失败：${variant.error}`
      : `${variant.recommendedModel} · ${variant.reliability}`;
    const badge = document.createElement("span");
    badge.className = `stress-badge${variant.flipped ? " flip" : ""}`;
    badge.textContent = variant.flipped ? "结论翻转" : "结论稳定";
    row.append(title, model, badge);
    return row;
  }));
}

async function runStressTest() {
  if (!state.result || state.resultStale || !state.lastData) return;
  if (state.lastData.kind === "iq") {
    showToast("IQ 模式暂不支持反事实压力测试。", true);
    return;
  }
  if (state.result.sampleCount > 50000) {
    showToast("压力测试仅支持 5 万点以内，请先降低样本量。", true);
    return;
  }
  elements.stressButton.disabled = true;
  elements.stressButton.textContent = "测试中…";
  elements.stressList.replaceChildren();
  try {
    const baseline = {
      model: state.result.unknown ? "unknown" : state.result.best?.label ?? "unknown",
    };
    const result = await stressTestSafely(state.lastData.time, state.lastData.values, baseline);
    if (state.resultStale) return;
    if (!result || !Array.isArray(result.variants)) {
      throw new Error("压力测试返回格式无效，请刷新页面后重试。");
    }
    renderStress(result);
  } catch (error) {
    if (!state.resultStale) {
      showToast(error instanceof Error ? error.message : "压力测试失败。", true);
    }
  } finally {
    if (!state.resultStale) {
      elements.stressButton.disabled = false;
      elements.stressButton.textContent = "重新运行压力测试";
    }
  }
}

function render(result) {
  const best = result.best;
  elements.recommendation.textContent = result.unknown
    ? "暂不推荐模型"
    : `推荐：${best.label}`;
  elements.reliability.textContent = result.reliability.label;
  elements.reliability.className = `reliability-badge ${
    result.reliability.level === "caution"
      ? "caution"
      : result.reliability.level === "unreliable"
        ? "unreliable"
        : result.reliability.level === "insufficient_evidence"
          ? "insufficient"
          : ""
  }`;
  elements.subtitle.textContent = result.unknown
    ? "主谱峰不足或候选模型无法解释数据；系统拒绝强行给出结论。"
    : `${result.reliability.evidence.filter((item) => item.status === "pass").length}/${result.reliability.evidence.length} 项证据通过 · 模型只在候选库内竞争 · ${Math.round(result.elapsedMs)} ms · ${result.engine === "worker" ? "Worker" : "主线程"}`;
  elements.resultAnnouncer.textContent = result.unknown
    ? "分析完成：证据不足，暂不推荐模型。"
    : `分析完成：推荐${best.label}，可信等级${result.reliability.label}。`;
  renderConclusion(result);
  renderHealth(result);
  renderModulation(result);
  const stressAvailable = result.kind !== "iq" && result.sampleCount <= 50000;
  elements.stressButton.disabled = !stressAvailable;
  elements.stressButton.textContent = stressAvailable ? "运行反事实测试" : result.kind === "iq" ? "IQ 模式暂不支持" : "样本过大不可用";
  elements.stressList.replaceChildren();
  elements.metricSamples.textContent = `${result.sampleCount.toLocaleString()} 点`;
  elements.metricRate.textContent = `${result.sampleRate.toFixed(2)} Hz · Nyq ${result.nyquist.toFixed(1)} Hz`;
  elements.metricR2.textContent = best?.metrics.r2 == null ? "—" : `R² ${best.metrics.r2.toFixed(4)}`;
  elements.metricRmse.textContent = best ? `RMSE ${best.metrics.rmse.toFixed(4)} a.u.` : "无有效候选";
  elements.metricGap.textContent =
    result.reliability.bicGap == null ? "—" : result.reliability.bicGap.toFixed(1);
  elements.metricResolution.textContent = `±${(1 / result.duration).toFixed(4)} Hz`;
  elements.metricDuration.textContent = `${result.duration.toFixed(3)} s 观测`;
  renderCandidates(result);
  renderParameters(result);
  renderEvidence(result);
  renderLocalExplanation(result);
  elements.download.disabled = false;
  requestAnimationFrame(() => renderCharts(result));
  window.SignalInsightLayout?.syncConditional?.();
}

function renderCandidates(result) {
  elements.candidateBody.replaceChildren();
  for (const candidate of result.candidates) {
    const row = document.createElement("tr");
    if (candidate === result.best && !result.unknown) row.className = "best-row";
    const values = [
      `${candidate.label}${candidate === result.best && !result.unknown ? " · 推荐" : ""}`,
      candidate.metrics.r2 == null ? "—" : candidate.metrics.r2.toFixed(4),
      formatNumber(candidate.metrics.rmse),
      formatNumber(candidate.metrics.aic, 1),
      formatNumber(candidate.metrics.bic, 1),
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 0) cell.className = "model-name";
      row.append(cell);
    });
    elements.candidateBody.append(row);
  }
  if (!result.candidates.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "没有形成有效候选";
    row.append(cell);
    elements.candidateBody.append(row);
  }
}

function renderParameters(result) {
  elements.parameterBody.replaceChildren();
  const parameters = result.unknown ? [] : (result.best?.parameters ?? []);
  if (!parameters.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "无可靠参数估计";
    row.append(cell);
    elements.parameterBody.append(row);
    return;
  }
  for (const parameter of parameters) {
    const row = document.createElement("tr");
    const label = document.createElement("td");
    label.className = "model-name";
    label.textContent = parameter.label + (parameter.reference ? ` · ${parameter.reference}` : "");
    const value = document.createElement("td");
    value.textContent = formatNumber(parameter.value);
    const unit = document.createElement("td");
    unit.textContent = parameter.unit;
    const uncertainty = document.createElement("td");
    uncertainty.textContent = parameter.sigma == null
      ? "—"
      : parameter.sigmaKind === "resolution"
        ? `±${formatNumber(parameter.sigma)}（分辨率）`
        : `±${formatNumber(parameter.sigma)}`;
    row.append(label, value, unit, uncertainty);
    elements.parameterBody.append(row);
  }
}

function renderEvidence(result) {
  elements.evidenceList.replaceChildren();
  for (const item of result.reliability.evidence) {
    const row = document.createElement("div");
    row.className = "evidence-item";
    row.dataset.evidenceId = item.id;
    const dot = document.createElement("span");
    dot.className = `evidence-dot ${item.status === "pass" ? "" : item.status}`;
    const copy = document.createElement("div");
    copy.className = "evidence-copy";
    const title = document.createElement("strong");
    title.textContent = item.label;
    const detail = document.createElement("small");
    detail.textContent = item.detail;
    copy.append(title, detail);
    const value = document.createElement("div");
    value.className = "evidence-value";
    value.textContent = item.value;
    row.append(dot, copy, value);
    elements.evidenceList.append(row);
  }
  elements.limitationList.replaceChildren(...result.reliability.limitations.map(listItem));
  elements.nextStepList.replaceChildren(...result.reliability.nextSteps.map(listItem));
}

function listItem(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

function renderAiLimitations(limitations) {
  const items = Array.isArray(limitations)
    ? limitations.map((text) => String(text ?? "").trim().slice(0, 500)).filter(Boolean).slice(0, 4)
    : [];
  elements.aiLimitations.replaceChildren(...items.map((text) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    return paragraph;
  }));
  elements.aiLimitations.hidden = items.length === 0;
}

function renderQwenExplanation(explanation, statusText = "Qwen 仅解释已计算证据，未修改任何数值结论。") {
  elements.aiSummary.textContent = String(explanation.summary ?? "").slice(0, 2200);
  const observations = Array.isArray(explanation.observations) ? explanation.observations : [];
  elements.aiObservations.replaceChildren(...observations.slice(0, 6).map((text) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = String(text).slice(0, 500);
    return paragraph;
  }));
  renderAiLimitations(explanation.limitations);
  elements.aiStatus.textContent = statusText;
  elements.aiButton.textContent = "重新生成解释";
}

function renderLocalExplanation(result) {
  const explanation = templateExplanation(result);
  elements.aiSummary.textContent = explanation.summary;
  elements.aiObservations.replaceChildren(...explanation.observations.slice(0, 4).map((text) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    return paragraph;
  }));
  renderAiLimitations(explanation.limitations);
  if (state.aiHealth === "configured") {
    elements.aiStatus.textContent = "AI 不参与参数计算，也不能修改可信等级。";
    elements.aiButton.disabled = false;
    elements.aiButton.textContent = "用 Qwen 深入解释";
  } else if (state.aiHealth === "not_configured") {
    elements.aiStatus.textContent = "当前显示确定性解释；配置 DASHSCOPE_API_KEY 后可启用 Qwen。";
    elements.aiButton.disabled = true;
    elements.aiButton.textContent = "Qwen 尚未配置";
  } else if (state.aiHealth === "unreachable") {
    elements.aiStatus.textContent = "无法连接 AI Function；本地预览或网络不可用，继续显示确定性解释。";
    elements.aiButton.disabled = true;
    elements.aiButton.textContent = "AI 服务不可达";
  } else {
    elements.aiStatus.textContent = "正在检查 AI 服务…";
    elements.aiButton.disabled = true;
    elements.aiButton.textContent = "正在检查 AI 服务…";
  }
}

function downsample(x, series, maxPoints = 1600) {
  const step = Math.max(1, Math.ceil(x.length / maxPoints));
  const indices = [];
  for (let index = 0; index < x.length; index += step) indices.push(index);
  if (indices.at(-1) !== x.length - 1) indices.push(x.length - 1);
  return {
    x: indices.map((index) => x[index]),
    series: series.map((values) => indices.map((index) => values[index])),
  };
}

function renderCharts(result) {
  const windowCount = Math.min(
    result.series.time.length,
    Math.max(64, Math.ceil(result.sampleRate * 0.12)),
  );
  const windowTime = result.series.time.slice(0, windowCount);
  const observedWindow = result.series.observed.slice(0, windowCount);
  const fittedWindow = result.series.fitted.slice(0, windowCount);
  elements.timeLegend.textContent = result.kind === "iq" ? "I 分量 · 观测 / 拟合" : "局部 0.12 s · 观测 / 拟合";
  drawPlot(
    elements.timeChart,
    windowTime,
    [
      { values: observedWindow, color: "cyan", width: 1 },
      { values: fittedWindow, color: "warn", width: 1.4 },
    ],
    { xLabel: "time / s", yLabel: "amplitude" },
  );
  const spectrumIndices = result.spectrum.frequencies
    .map((frequency, index) => ({ frequency, index }))
    .filter((item) => item.frequency <= Math.min(result.nyquist, (result.best?.frequencies.at(-1) ?? result.nyquist) * 1.8 + 20));
  drawPlot(
    elements.spectrumChart,
    spectrumIndices.map((item) => item.frequency),
    [{ values: spectrumIndices.map((item) => result.spectrum.amplitudes[item.index]), color: "cyan" }],
    {
      fill: true,
      xLabel: "frequency / Hz",
      yLabel: "amplitude",
      markers: (result.best?.frequencies ?? []).map((frequency, index) => ({
        x: frequency,
        y: amplitudeAt(result.spectrum, frequency),
        label: `f${index + 1} ${frequency.toFixed(2)}`,
      })),
    },
  );
  const residual = downsample(result.series.time, [result.series.residual]);
  drawPlot(
    elements.residualChart,
    residual.x,
    [{ values: residual.series[0], color: "accent", width: 1.1 }],
    { xLabel: "time / s", yLabel: "residual" },
  );
}

function amplitudeAt(spectrum, frequency) {
  let closestIndex = 0;
  let closestDistance = Infinity;
  spectrum.frequencies.forEach((value, index) => {
    const distance = Math.abs(value - frequency);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return spectrum.amplitudes[closestIndex];
}

async function checkAiAvailability() {
  const { configured, health } = await fetchAiHealth();
  state.aiConfigured = configured;
  state.aiHealth = health;
  if (state.result && !state.resultStale) renderLocalExplanation(state.result);
}

async function requestQwenExplanation() {
  if (!state.result || state.resultStale || state.busy || !state.aiConfigured) return;
  const requestId = ++state.aiRequestSequence;
  const version = state.resultVersion;
  const payload = buildAiPayload(state.result);
  const model = elements.modelSelect.value;
  const cacheKey = `${JSON.stringify(payload)}::${model}`;
  const cached = aiCache.get(cacheKey);
  if (cached) {
    if (requestId === state.aiRequestSequence && version === state.resultVersion && !state.resultStale) {
      renderQwenExplanation(cached, "使用本次会话缓存；数值未重新计算。");
    }
    return;
  }
  elements.aiButton.disabled = true;
  elements.aiButton.textContent = "Qwen 正在解释…";
  elements.aiStatus.textContent = "正在发送结构化数值摘要，不包含原始序列。";
  try {
    const explanation = await fetchExplanation(payload, model, AbortSignal.timeout(30000));
    if (requestId !== state.aiRequestSequence || version !== state.resultVersion || state.resultStale) return;
    aiCache.set(cacheKey, explanation);
    if (aiCache.size > AI_CACHE_LIMIT) aiCache.delete(aiCache.keys().next().value);
    renderQwenExplanation(explanation);
  } catch (error) {
    if (requestId !== state.aiRequestSequence || version !== state.resultVersion || state.resultStale) return;
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    elements.aiStatus.textContent = timedOut
      ? "Qwen 响应超时，请重试。"
      : error instanceof Error ? error.message : "Qwen 暂不可用。";
    elements.aiButton.textContent = "重试 Qwen 解释";
  } finally {
    if (requestId === state.aiRequestSequence && !state.resultStale) {
      elements.aiButton.disabled = false;
    }
  }
}

function downloadReport() {
  if (!state.result || state.resultStale) return;
  const report = buildReport(state.result, state.sourceLabel);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `signalinsight-report-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("报告已导出；包含参数、证据与方法边界。");
}

function loadHistory() {
  state.history = getHistory();
  renderHistory();
}

function saveHistory(result, source) {
  const { entries, persisted } = addHistory(result, source);
  state.history = entries;
  if (!persisted) showToast("本地历史保存失败（存储空间不足或被禁用）。", true);
  renderHistory();
}

function renderHistory() {
  elements.historyList.replaceChildren();
  if (!state.history.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "暂无历史；完成一次分析后会自动保存摘要。";
    elements.historyList.append(empty);
    return;
  }
  for (const entry of state.history) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    const time = document.createElement("span");
    time.className = "history-time";
    time.textContent = new Date(entry.createdAt).toLocaleString();
    const source = document.createElement("span");
    source.className = "history-source";
    source.textContent = entry.source;
    const model = document.createElement("span");
    model.className = "history-model";
    model.textContent = `${entry.modelLabel} · ${entry.reliabilityLabel}`;
    button.append(time, source, model);
    button.addEventListener("click", () => renderHistoryDetail(entry));
    elements.historyList.append(button);
  }
}

function renderHistoryDetail(entry) {
  elements.historyDetail.replaceChildren();
  const note = document.createElement("p");
  note.className = "history-detail-note";
  note.textContent = `历史快照 · ${new Date(entry.createdAt).toLocaleString()} · 未重新计算数值，不覆盖当前结果。`;
  const meta = document.createElement("p");
  meta.className = "history-detail-meta";
  meta.textContent = `${entry.source} · ${entry.modelLabel} · ${entry.reliabilityLabel} · ${entry.sampleCount} 点 @ ${entry.sampleRate.toFixed(2)} Hz · 体检 ${entry.healthStatus}`;
  elements.historyDetail.append(note, meta);
  if (entry.parameters?.length) {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const text of ["参数", "估计值", "单位"]) {
      const th = document.createElement("th");
      th.textContent = text;
      headRow.append(th);
    }
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    for (const parameter of entry.parameters) {
      const row = document.createElement("tr");
      for (const text of [parameter.label, formatNumber(parameter.value), parameter.unit]) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.append(cell);
      }
      tbody.append(row);
    }
    table.append(thead, tbody);
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    wrap.append(table);
    elements.historyDetail.append(wrap);
  } else {
    const none = document.createElement("p");
    none.className = "history-detail-meta";
    none.textContent = "无可靠参数估计（unknown）。";
    elements.historyDetail.append(none);
  }
  elements.historyDetail.hidden = false;
}

function clearHistory() {
  state.history = [];
  clearHistoryStorage();
  elements.historyDetail.hidden = true;
  elements.historyDetail.replaceChildren();
  renderHistory();
  showToast("本地分析历史已清空。");
}

function bindEvents() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      elements.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      state.uploadedColumns = null;
      state.inputMode = "real";
      elements.iqMode.checked = false;
      elements.qColumnWrap.hidden = true;
      elements.mapping.hidden = true;
      elements.csvPreview.hidden = true;
      state.data = buildExample(tab.dataset.example);
      markDataChanged("已切换示例，正在分析…");
      analyzeCurrent();
    });
  });

  elements.file.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("CSV 文件超过 10 MB。", true);
      return;
    }
    elements.csvPreview.hidden = true;
    try {
      const parsed = parseCsv(await file.text());
      elements.tabs.forEach((tab) => tab.classList.remove("active"));
      populateMapping(parsed, file.name);
      showToast("CSV 已载入，请确认字段映射后运行分析。");
    } catch (error) {
      elements.mapping.hidden = true;
      elements.csvPreview.hidden = true;
      state.uploadedColumns = null;
      state.inputMode = "real";
      elements.iqMode.checked = false;
      elements.qColumnWrap.hidden = true;
      markDataChanged("CSV 解析失败，请检查文件。");
      showToast(error instanceof Error ? error.message : "CSV 解析失败。", true);
    } finally {
      event.target.value = "";
    }
  });

  elements.matFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast("MAT 文件超过 10 MB。", true);
      return;
    }
    elements.csvPreview.hidden = true;
    try {
      const variables = parseMat(await file.arrayBuffer());
      const variable = variables.find((item) => item.rows > 0 && item.cols > 0);
      if (!variable) throw new Error("MAT 中没有可用的数值矩阵。");
      const rate = Number(elements.matRate.value);
      const parsed = matToParsed(variable, Number.isFinite(rate) && rate > 0 ? rate : 1000);
      elements.tabs.forEach((tab) => tab.classList.remove("active"));
      elements.mapping.hidden = true;
      populateMapping(parsed, file.name);
      showToast("MAT 已载入，请确认字段映射后运行分析。");
    } catch (error) {
      elements.mapping.hidden = true;
      elements.csvPreview.hidden = true;
      state.uploadedColumns = null;
      state.inputMode = "real";
      elements.iqMode.checked = false;
      elements.qColumnWrap.hidden = true;
      markDataChanged("MAT 解析失败，请检查文件。");
      showToast(error instanceof Error ? error.message : "MAT 解析失败。", true);
    } finally {
      event.target.value = "";
    }
  });

  elements.analyze.addEventListener("click", analyzeCurrent);
  elements.download.addEventListener("click", downloadReport);
  elements.aiButton.addEventListener("click", requestQwenExplanation);
  elements.stressButton.addEventListener("click", runStressTest);
  elements.timeColumn.addEventListener("change", () => markDataChanged("字段映射已变更，请重新运行分析。"));
  elements.signalColumn.addEventListener("change", () => {
    state.dataVersion += 1;
    invalidateResult("字段映射已变更，请重新运行分析。");
  });
  elements.iqMode.addEventListener("change", () => {
    state.inputMode = elements.iqMode.checked ? "iq" : "real";
    elements.qColumnWrap.hidden = !elements.iqMode.checked;
    state.dataVersion += 1;
    invalidateResult("分析模式已切换，请重新运行分析。");
    updateChannelCard();
  });
  elements.qColumn.addEventListener("change", () => {
    state.dataVersion += 1;
    invalidateResult("Q 列已变更，请重新运行分析。");
  });
  elements.channelButton.addEventListener("click", analyzeAllChannels);
  elements.historyClear.addEventListener("click", clearHistory);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.result) {
        renderCharts(state.result);
        if (state.result.best?.modulationView) drawModulationChart(state.result);
      }
    }, 150);
  });
}

function init() {
  initTheme();
  bindEvents();
  loadHistory();
  state.data = buildExample("single");
  elements.tabs[0].classList.add("active");
  analyzeCurrent();
  checkAiAvailability();
}

init();

/* ---------- Workbench layout (pixel canvas) ---------- */

(() => {
  const grid = document.getElementById("tile-grid");
  if (!grid) return;

  const COLS = 12;
  const ROWS = 22;
  const GAP = 6;
  const SNAP = 20;
  const STORAGE_KEY = "signalinsight.workbench.v2";
  const LEGACY_KEY = "signalinsight.workbench.v1";
  const PREFERRED = {
    summary: { w: 12, h: 2 },
    conclusion: { w: 8, h: 4 },
    metrics: { w: 4, h: 4 },
    time: { w: 4, h: 5 },
    spectrum: { w: 4, h: 5 },
    residual: { w: 4, h: 5 },
    candidates: { w: 7, h: 5 },
    evidence: { w: 5, h: 5 },
    health: { w: 6, h: 6 },
    ai: { w: 6, h: 6 },
    stress: { w: 4, h: 5 },
    history: { w: 4, h: 5 },
    channel: { w: 4, h: 5 },
    modulation: { w: 6, h: 4 },
  };
  const MINIMUM = {
    summary: { w: 3, h: 2 },
    conclusion: { w: 4, h: 3 },
    metrics: { w: 3, h: 4 },
    time: { w: 3, h: 3 },
    spectrum: { w: 3, h: 3 },
    residual: { w: 3, h: 3 },
    candidates: { w: 7, h: 5 },
    evidence: { w: 4, h: 4 },
    health: { w: 4, h: 4 },
    ai: { w: 4, h: 5 },
    stress: { w: 3, h: 3 },
    history: { w: 2, h: 3 },
    channel: { w: 4, h: 4 },
    modulation: { w: 5, h: 4 },
  };
  const MINIMUM_PX = {
    summary: { w: 300, h: 68 },
    conclusion: { w: 300, h: 120 },
    metrics: { w: 240, h: 150 },
    time: { w: 240, h: 150 },
    spectrum: { w: 240, h: 150 },
    residual: { w: 240, h: 150 },
    candidates: { w: 500, h: 160 },
    evidence: { w: 310, h: 176 },
    health: { w: 300, h: 160 },
    ai: { w: 300, h: 210 },
    stress: { w: 300, h: 110 },
    history: { w: 200, h: 120 },
    channel: { w: 300, h: 150 },
    modulation: { w: 310, h: 150 },
  };

  const readCells = (element) => {
    const style = element.getAttribute("style") || "";
    const column = /grid-column:\s*(\d+)\s*\/\s*span\s*(\d+)/.exec(style);
    const row = /grid-row:\s*(\d+)\s*\/\s*span\s*(\d+)/.exec(style);
    if (!column || !row) return null;
    return { x: Number(column[1]), y: Number(row[1]), w: Number(column[2]), h: Number(row[2]) };
  };

  const meta = new Map();
  for (const element of grid.querySelectorAll(".tile")) {
    const name = element.dataset.module;
    if (!name) continue;
    meta.set(name, {
      name,
      element,
      chip: document.querySelector(`.task-chip[data-module="${name}"]`),
      preferred: PREFERRED[name] || { w: 4, h: 4 },
      minimum: MINIMUM[name] || { w: 3, h: 3 },
      initial: readCells(element),
    });
  }
  if (!meta.size) return;

  const order = [...meta.keys()];
  const defaultActive = new Set([...meta.values()].filter((item) => !item.element.hidden).map((item) => item.name));
  const defaultCells = new Map();
  for (const item of meta.values()) {
    if (item.initial) defaultCells.set(item.name, { ...item.initial });
  }

  let active = new Set(defaultActive);
  let placements = new Map();

  const body = document.body;
  const rail = document.getElementById("control-rail");
  const railToggle = document.getElementById("rail-toggle");
  const railScrim = document.getElementById("rail-scrim");
  const railScale = rail?.querySelector(".rail-scale");
  const emptyState = document.getElementById("empty-workspace");
  const status = document.getElementById("layout-status");
  const taskRun = document.getElementById("task-run");
  const taskExport = document.getElementById("task-export");
  const taskReset = document.getElementById("layout-reset");

  const notify = (message, type = "info") => {
    try { showToast(message, type); } catch { /* noop */ }
  };

  const box = () => ({ w: grid.clientWidth, h: grid.clientHeight });

  const cellRect = (x, y, w, h) => {
    const { w: width, h: height } = box();
    const colW = Math.max(1, (width - GAP * (COLS - 1)) / COLS);
    const rowH = Math.max(1, (height - GAP * (ROWS - 1)) / ROWS);
    return {
      x: Math.round((x - 1) * (colW + GAP)),
      y: Math.round((y - 1) * (rowH + GAP)),
      w: Math.max(1, Math.round(w * colW + (w - 1) * GAP)),
      h: Math.max(1, Math.round(h * rowH + (h - 1) * GAP)),
    };
  };

  const minSize = (name) => {
    const minimum = meta.get(name)?.minimum || { w: 3, h: 3 };
    const floor = MINIMUM_PX[name] || { w: 150, h: 86 };
    const cell = cellRect(1, 1, minimum.w, minimum.h);
    return {
      w: Math.max(floor.w, cell.w),
      h: Math.max(floor.h, cell.h),
    };
  };

  const preferredSize = (name) => {
    const preferred = meta.get(name)?.preferred || { w: 4, h: 4 };
    return cellRect(1, 1, preferred.w, preferred.h);
  };

  const overlaps = (a, b) => a.x < b.x + b.w - 0.5 && a.x + a.w > b.x + 0.5 && a.y < b.y + b.h - 0.5 && a.y + a.h > b.y + 0.5;

  const clampPlacement = (name, p) => {
    const { w: width, h: height } = box();
    const min = minSize(name);
    const w = Math.min(width, Math.max(min.w, p.w));
    const h = Math.min(height, Math.max(min.h, p.h));
    const x = Math.max(0, Math.min(p.x, width - w));
    const y = Math.max(0, Math.min(p.y, height - h));
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  };

  const fits = (rect, skip, map = placements) => {
    const { w: width, h: height } = box();
    if (rect.x < -0.5 || rect.y < -0.5 || rect.x + rect.w > width + 0.5 || rect.y + rect.h > height + 0.5) return false;
    for (const [name, other] of map) {
      if (name === skip) continue;
      if (overlaps(rect, other)) return false;
    }
    return true;
  };

  const findSpot = (w, h, skip, map = placements) => {
    const { w: width, h: height } = box();
    if (w > width || h > height) return null;
    for (let y = 0; y <= height - h; y += 8) {
      for (let x = 0; x <= width - w; x += 8) {
        const rect = { x, y, w, h };
        if (fits(rect, skip, map)) return rect;
      }
    }
    return null;
  };

  const nearestSpot = (rect, skip) => {
    const { w: width, h: height } = box();
    const xs = new Set([0, width - rect.w]);
    const ys = new Set([0, height - rect.h]);
    for (const [name, other] of placements) {
      if (name === skip) continue;
      xs.add(other.x);
      xs.add(other.x + other.w);
      xs.add(other.x - rect.w);
      xs.add(other.x + other.w - rect.w);
      ys.add(other.y);
      ys.add(other.y + other.h);
      ys.add(other.y - rect.h);
      ys.add(other.y + other.h - rect.h);
    }
    let best = null;
    let bestDistance = Infinity;
    for (const rawX of xs) {
      const x = Math.max(0, Math.min(rawX, width - rect.w));
      for (const rawY of ys) {
        const y = Math.max(0, Math.min(rawY, height - rect.h));
        const candidate = { x, y, w: rect.w, h: rect.h };
        if (!fits(candidate, skip)) continue;
        const distance = (x - rect.x) ** 2 + (y - rect.y) ** 2;
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
    }
    if (best) return { x: Math.round(best.x), y: Math.round(best.y), w: rect.w, h: rect.h };
    return findSpot(rect.w, rect.h, skip);
  };

  const normalize = () => {
    const { w: width, h: height } = box();
    for (const name of order) {
      const placement = placements.get(name);
      if (!placement) continue;
      const w = Math.min(width, Math.max(1, placement.w));
      const h = Math.min(height, Math.max(1, placement.h));
      const x = Math.max(0, Math.min(placement.x, width - w));
      const y = Math.max(0, Math.min(placement.y, height - h));
      placements.set(name, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    }
    for (const name of order) {
      const placement = placements.get(name);
      if (!placement) continue;
      if (!fits(placement, name)) {
        const spot = nearestSpot(placement, name);
        if (spot) placements.set(name, spot);
      }
    }
  };

  const resetToDefaults = () => {
    active = new Set(defaultActive);
    placements = new Map();
    for (const [name, cells] of defaultCells) {
      if (active.has(name)) placements.set(name, cellRect(cells.x, cells.y, cells.w, cells.h));
    }
  };

  const restore = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && Array.isArray(saved.active)) {
        const names = saved.active.filter((name) => meta.has(name));
        const map = new Map();
        for (const name of names) {
          const raw = saved.placements?.[name];
          if (!Array.isArray(raw) || raw.length !== 4) continue;
          const placement = { x: Number(raw[0]), y: Number(raw[1]), w: Number(raw[2]), h: Number(raw[3]) };
          if (![placement.x, placement.y, placement.w, placement.h].every(Number.isFinite)) continue;
          if (placement.w <= 0 || placement.h <= 0) continue;
          map.set(name, placement);
        }
        if (map.size === names.length && names.length) {
          active = new Set(names);
          placements = map;
          normalize();
          return;
        }
      }
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
      if (legacy && Array.isArray(legacy.active)) {
        const names = legacy.active.filter((name) => meta.has(name));
        const map = new Map();
        for (const name of names) {
          const raw = legacy.placements?.[name];
          if (!Array.isArray(raw) || raw.length !== 4) continue;
          map.set(name, cellRect(Number(raw[0]), Number(raw[1]), Number(raw[2]), Number(raw[3])));
        }
        if (map.size === names.length && names.length) {
          active = new Set(names);
          placements = map;
          normalize();
          return;
        }
      }
    } catch { /* use defaults */ }
    resetToDefaults();
  };

  const persist = () => {
    try {
      const stored = {};
      for (const name of active) {
        const p = placements.get(name);
        if (p) stored[name] = [Math.round(p.x), Math.round(p.y), Math.round(p.w), Math.round(p.h)];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ active: [...active], placements: stored, viewport: [grid.clientWidth, grid.clientHeight] }));
    } catch { /* storage unavailable */ }
  };

  const save = () => persist();

  const flash = (name) => {
    const element = meta.get(name)?.element;
    if (!element || element.hidden) return;
    element.classList.add("tile-pulse");
    window.setTimeout(() => element.classList.remove("tile-pulse"), 1100);
  };

  const channelVerdict = () => {
    if (!state.uploadedColumns) {
      return { known: true, available: false, reason: "多通道需要上传含 ≥2 个信号列的 CSV / MAT 数据。" };
    }
    if (state.inputMode === "iq") {
      return { known: true, available: false, reason: "IQ 数据为单通道复信号，暂不支持多通道分析。" };
    }
    const columns = signalColumns();
    if (columns.length < 2) {
      return { known: true, available: false, reason: "当前数据只有 1 个信号列，多通道至少需要 2 个。" };
    }
    return { known: true, available: true, reason: "" };
  };

  const modulationVerdict = () => {
    if (!state.result || state.resultStale) return { known: false, available: true, reason: "" };
    const best = state.result.best;
    const available = Boolean(best?.modulationView) && ["am", "fm"].includes(best?.family);
    return {
      known: true,
      available,
      reason: available ? "" : `当前最佳模型为${best?.label ?? "未知"}，不属于 AM / FM 调制。`,
    };
  };

  const conditionalRules = {
    channel: channelVerdict,
    modulation: modulationVerdict,
  };

  const closeTimers = new Map();
  const syncConditional = () => {
    for (const [name, rule] of Object.entries(conditionalRules)) {
      const item = meta.get(name);
      if (!item?.chip) continue;
      const verdict = rule();
      if (!verdict.known) continue;
      const label = item.element.querySelector(".tile-head h3")?.textContent?.trim() || name;
      const stateLabel = item.chip.querySelector(".chip-state");
      if (verdict.available) {
        item.chip.classList.remove("is-unavailable");
        item.chip.disabled = false;
        item.chip.removeAttribute("aria-disabled");
        item.chip.removeAttribute("title");
        const timer = closeTimers.get(name);
        if (timer) {
          window.clearTimeout(timer);
          closeTimers.delete(name);
        }
        item.element.classList.remove("is-invalid");
        if (stateLabel) stateLabel.textContent = active.has(name) ? "已放置" : "拖入";
        continue;
      }
      item.chip.classList.add("is-unavailable");
      item.chip.disabled = true;
      item.chip.setAttribute("aria-disabled", "true");
      item.chip.title = verdict.reason;
      if (stateLabel) stateLabel.textContent = "不可用";
      if (!active.has(name) || closeTimers.has(name)) continue;
      item.element.classList.add("is-invalid");
      closeTimers.set(name, window.setTimeout(() => {
        closeTimers.delete(name);
        item.element.classList.remove("is-invalid");
        if (!active.has(name)) return;
        const again = rule();
        if (!again.known || again.available) return;
        removeModule(name, { quiet: true });
        notify(`${label} 已不适用当前数据，自动关闭。`, "error");
      }, 700));
    }
  };

  const paint = (element, p) => {
    if (element.classList.contains("is-focused")) return;
    element.style.left = `${p.x}px`;
    element.style.top = `${p.y}px`;
    element.style.width = `${p.w}px`;
    element.style.height = `${p.h}px`;
  };

  const apply = ({ repaint = true } = {}) => {
    for (const item of meta.values()) {
      const isActive = active.has(item.name);
      item.element.hidden = !isActive;
      if (isActive) {
        const p = placements.get(item.name);
        if (p) {
          item.element.style.gridColumn = "";
          item.element.style.gridRow = "";
          paint(item.element, p);
        }
      }
      if (item.chip) {
        item.chip.classList.toggle("is-placed", isActive);
        const stateLabel = item.chip.querySelector(".chip-state");
        if (stateLabel) {
          stateLabel.textContent = isActive
            ? "已放置"
            : item.chip.classList.contains("is-unavailable")
              ? "不可用"
              : "拖入";
        }
      }
    }
    if (status) status.textContent = `${active.size} / ${meta.size}`;
    if (emptyState) emptyState.hidden = active.size > 0;
    if (repaint) scheduleFit();
  };

  const tileScale = (element) => element.querySelector(".tile-scale");

  const fitTiles = () => {
    for (const name of active) {
      const item = meta.get(name);
      if (!item || item.element.hidden) continue;
      if (item.element.classList.contains("is-focused")) continue;
      const scale = tileScale(item.element);
      if (!scale) continue;
      scale.style.transform = "";
      scale.style.width = "100%";
      scale.style.height = "100%";
    }
  };

  let chartTimer = null;
  const refreshCharts = () => {
    window.clearTimeout(chartTimer);
    chartTimer = window.setTimeout(() => {
      try {
        if (typeof state !== "undefined" && state.result) {
          renderCharts(state.result);
          if (state.result.best?.modulationView && !meta.get("modulation")?.element.hidden) drawModulationChart(state.result);
        }
      } catch { /* charts redraw on next analysis */ }
    }, 60);
  };

  const chartSizes = new WeakMap();
  const chartObserver = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const rect = entry.target.getBoundingClientRect();
      const size = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      if (chartSizes.get(entry.target) !== size) {
        chartSizes.set(entry.target, size);
        changed = true;
      }
    }
    if (changed) refreshCharts();
  });
  for (const item of meta.values()) {
    const canvas = item.element.querySelector("canvas");
    if (canvas) chartObserver.observe(canvas);
  }

  let fitTimer = null;
  const scheduleFit = () => {
    window.clearTimeout(fitTimer);
    fitTimer = window.setTimeout(() => {
      fitTiles();
      fitRail();
    }, 40);
  };

  const fitRail = () => {
    if (!railScale || !rail) return;
    railScale.style.transform = "";
    railScale.style.width = "100%";
    const available = rail.clientHeight - 24;
    if (available <= 0) return;
    const natural = railScale.scrollHeight;
    if (natural > available + 1) {
      const s = Math.max(0.7, available / natural);
      railScale.style.width = `${100 / s}%`;
      railScale.style.transform = `scale(${s})`;
    }
  };

  const addModule = (name, { quiet = false } = {}) => {
    const item = meta.get(name);
    if (!item) return false;
    const verdict = conditionalRules[name]?.();
    if (verdict?.known && !verdict.available) {
      syncConditional();
      if (!quiet) notify(verdict.reason, "error");
      return false;
    }
    if (active.has(name)) {
      flash(name);
      return true;
    }
    const { w: width, h: height } = box();
    const min = minSize(name);
    const preferred = preferredSize(name);
    let spot = null;
    for (const factor of [1, 0.85, 0.7]) {
      const w = Math.max(min.w, Math.min(width, Math.round(preferred.w * factor)));
      const h = Math.max(min.h, Math.min(height, Math.round(preferred.h * factor)));
      spot = findSpot(w, h, name);
      if (spot) break;
    }
    if (spot) {
      active.add(name);
      placements.set(name, spot);
      apply();
      save();
      flash(name);
      return true;
    }
    const activeOrder = order
      .filter((other) => active.has(other))
      .sort((a, b) => (placements.get(a)?.y ?? 0) - (placements.get(b)?.y ?? 0) || (placements.get(a)?.x ?? 0) - (placements.get(b)?.x ?? 0));
    for (const factor of [0.92, 0.84, 0.76, 0.68, 0.6, 0.52]) {
      const packed = new Map();
      let failed = false;
      for (const other of activeOrder) {
        const source = placements.get(other);
        const otherMin = minSize(other);
        const w = Math.max(otherMin.w, Math.min(width, Math.round(source.w * factor)));
        const h = Math.max(otherMin.h, Math.min(height, Math.round(source.h * factor)));
        const slot = findSpot(w, h, other, packed);
        if (!slot) { failed = true; break; }
        packed.set(other, slot);
      }
      if (failed) continue;
      const w = Math.max(min.w, Math.min(width, Math.round(preferred.w * factor)));
      const h = Math.max(min.h, Math.min(height, Math.round(preferred.h * factor)));
      const slot = findSpot(w, h, name, packed);
      if (!slot) continue;
      packed.set(name, slot);
      placements = packed;
      active.add(name);
      apply();
      save();
      flash(name);
      if (!quiet) notify("工作区已自动压缩，所有模块均已放入。");
      return true;
    }
    if (!quiet) notify("工作区已满，请先移除一个模块。", "error");
    return false;
  };

  const removeModule = (name, { quiet = false } = {}) => {
    if (!active.has(name)) return;
    active.delete(name);
    placements.delete(name);
    apply();
    save();
    if (!quiet) notify(`${meta.get(name)?.element.querySelector(".tile-head h3")?.textContent || name} 已移入任务栏。`);
  };

  const reset = () => {
    resetToDefaults();
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch { /* noop */ }
    apply();
    notify("布局已恢复默认。");
  };

  const ensure = (name) => {
    if (!name || !meta.has(name)) return false;
    if (active.has(name)) {
      flash(name);
      return true;
    }
    return addModule(name, { quiet: true });
  };

  const linesFor = (name) => {
    const { w: width, h: height } = box();
    const xs = [0, width];
    const ys = [0, height];
    for (const [other, rect] of placements) {
      if (other === name) continue;
      xs.push(rect.x, rect.x + rect.w);
      ys.push(rect.y, rect.y + rect.h);
    }
    return { xs, ys };
  };

  const snapAxis = (edges, lines) => {
    let best = null;
    for (const line of lines) {
      for (const edge of edges) {
        const delta = line - edge;
        if (Math.abs(delta) <= SNAP && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, line };
        }
      }
    }
    return best;
  };

  let gesture = null;
  let raf = 0;
  let lastFrame = 0;
  let settleTimer = 0;

  const clearSettle = () => {
    if (!settleTimer) return;
    window.clearTimeout(settleTimer);
    settleTimer = 0;
    grid.querySelectorAll(".tile.is-settling").forEach((element) => element.classList.remove("is-settling"));
    apply();
  };

  const tick = (now) => {
    if (!gesture || gesture.type !== "move") {
      raf = 0;
      return;
    }
    const g = gesture;
    if (!g.target) {
      lastFrame = now;
      raf = requestAnimationFrame(tick);
      return;
    }
    const dt = Math.min(48, Math.max(8, now - lastFrame || 16));
    lastFrame = now;
    const steps = dt / 16.667;
    const age = Math.min(1, (now - g.startedAt) / 320);
    const follow = 0.1 + 0.14 * age;
    const k = 1 - Math.pow(1 - follow, steps);
    g.visual.x += (g.target.x - g.visual.x) * k;
    g.visual.y += (g.target.y - g.visual.y) * k;
    const { w: width, h: height } = box();
    g.visual.x = Math.max(0, Math.min(g.visual.x, width - g.rect.w));
    g.visual.y = Math.max(0, Math.min(g.visual.y, height - g.rect.h));
    g.element.style.left = `${g.visual.x.toFixed(2)}px`;
    g.element.style.top = `${g.visual.y.toFixed(2)}px`;
    raf = requestAnimationFrame(tick);
  };

  const startTick = () => {
    cancelAnimationFrame(raf);
    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const onPointerMove = (event) => {
    if (!gesture) return;
    const g = gesture;
    if (!g.moved && Math.abs(event.clientX - g.startX) + Math.abs(event.clientY - g.startY) < 3) return;
    g.moved = true;
    event.preventDefault();
    const bounds = grid.getBoundingClientRect();
    const { w: width, h: height } = box();

    if (g.type === "move") {
      const x = event.clientX - bounds.left - g.offsetX;
      const y = event.clientY - bounds.top - g.offsetY;
      const clampedX = Math.max(0, Math.min(x, width - g.rect.w));
      const clampedY = Math.max(0, Math.min(y, height - g.rect.h));
      const { xs, ys } = linesFor(g.name);
      const snapX = snapAxis([clampedX, clampedX + g.rect.w], xs);
      const snapY = snapAxis([clampedY, clampedY + g.rect.h], ys);
      const snappedX = Math.max(0, Math.min(clampedX + (snapX?.delta || 0), width - g.rect.w));
      const snappedY = Math.max(0, Math.min(clampedY + (snapY?.delta || 0), height - g.rect.h));
      const snapped = { x: Math.round(snappedX), y: Math.round(snappedY), w: g.rect.w, h: g.rect.h };
      const snapable = (snapX || snapY) && fits(snapped, g.name);
      g.target = snapable
        ? snapped
        : { x: Math.round(clampedX), y: Math.round(clampedY), w: g.rect.w, h: g.rect.h };
      return;
    }

    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    const start = g.rect;
    const dir = g.dir;
    let left = start.x;
    let top = start.y;
    let right = start.x + start.w;
    let bottom = start.y + start.h;
    if (dir.includes("e")) right += dx;
    if (dir.includes("w")) left += dx;
    if (dir.includes("s")) bottom += dy;
    if (dir.includes("n")) top += dy;

    left = Math.max(0, left);
    top = Math.max(0, top);
    right = Math.min(width, right);
    bottom = Math.min(height, bottom);

    const min = minSize(g.name);
    if (right - left < min.w) {
      if (dir.includes("w")) left = right - min.w;
      else right = left + min.w;
    }
    if (bottom - top < min.h) {
      if (dir.includes("n")) top = bottom - min.h;
      else bottom = top + min.h;
    }

    const { xs, ys } = linesFor(g.name);
    if (dir.includes("e")) {
      const snap = snapAxis([right], xs);
      if (snap) right += snap.delta;
    }
    if (dir.includes("w")) {
      const snap = snapAxis([left], xs);
      if (snap) left += snap.delta;
    }
    if (dir.includes("s")) {
      const snap = snapAxis([bottom], ys);
      if (snap) bottom += snap.delta;
    }
    if (dir.includes("n")) {
      const snap = snapAxis([top], ys);
      if (snap) top += snap.delta;
    }

    const startRight = start.x + start.w;
    const startBottom = start.y + start.h;
    for (const [other, rect] of placements) {
      if (other === g.name) continue;
      const verticalOverlap = top < rect.y + rect.h && bottom > rect.y;
      const horizontalOverlap = left < rect.x + rect.w && right > rect.x;
      if (verticalOverlap) {
        if (dir.includes("e") && rect.x >= startRight - 0.5) right = Math.min(right, rect.x);
        if (dir.includes("w") && rect.x + rect.w <= start.x + 0.5) left = Math.max(left, rect.x + rect.w);
      }
      if (horizontalOverlap) {
        if (dir.includes("s") && rect.y >= startBottom - 0.5) bottom = Math.min(bottom, rect.y);
        if (dir.includes("n") && rect.y + rect.h <= start.y + 0.5) top = Math.max(top, rect.y + rect.h);
      }
    }

    if (dir.includes("e")) right = Math.max(right, left + min.w);
    if (dir.includes("w")) left = Math.min(left, right - min.w);
    if (dir.includes("s")) bottom = Math.max(bottom, top + min.h);
    if (dir.includes("n")) top = Math.min(top, bottom - min.h);

    left = Math.max(0, left);
    top = Math.max(0, top);
    right = Math.min(width, right);
    bottom = Math.min(height, bottom);

    const next = {
      x: Math.round(left),
      y: Math.round(top),
      w: Math.round(right - left),
      h: Math.round(bottom - top),
    };
    g.target = next;
    paint(g.element, next);
  };

  const endGesture = () => {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    cancelAnimationFrame(raf);
    raf = 0;
    document.body.classList.remove("is-layout-gesture");
    grid.classList.remove("is-arranging");
    if (!g.moved) {
      g.element.classList.remove("is-lifted");
      return;
    }
    let final = g.target;
    if (g.type === "move" && final) {
      if (!fits(final, g.name)) {
        const spot = nearestSpot(final, g.name);
        if (spot) {
          final = spot;
          notify("已自动避让相邻模块。");
        } else {
          final = { ...g.rect };
          notify("空间不足，已保留原位置。", "error");
        }
      }
    }
    if (!final) {
      g.element.classList.remove("is-lifted");
      return;
    }
    const element = g.element;
    element.classList.remove("is-lifted");
    element.classList.add("is-settling");
    paint(element, final);
    placements.set(g.name, { ...final });
    save();
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      settleTimer = 0;
      element.classList.remove("is-settling");
      apply();
      fitTiles();
      flash(g.name);
    }, 210);
  };

  const cancelGesture = () => {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    cancelAnimationFrame(raf);
    raf = 0;
    document.body.classList.remove("is-layout-gesture");
    grid.classList.remove("is-arranging");
    g.element.classList.remove("is-lifted");
    g.element.classList.remove("is-settling");
    paint(g.element, g.rect);
    placements.set(g.name, { ...g.rect });
    apply();
  };

  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", endGesture);
  window.addEventListener("pointercancel", endGesture);

  grid.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".tile-close")) return;
    if (event.target.closest(".result-info-button")) return;
    const handle = event.target.closest(".resize-handle");
    const head = event.target.closest(".tile-head");
    if (!handle && !head) return;
    const element = event.target.closest(".tile");
    const name = element?.dataset.module;
    const placement = placements.get(name);
    if (!name || !placement || element.hidden) return;
    clearSettle();
    event.preventDefault();
    const bounds = grid.getBoundingClientRect();
    if (handle) {
      gesture = {
        type: "resize",
        name,
        element,
        rect: { ...placement },
        dir: handle.dataset.dir || "se",
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        target: null,
      };
    } else {
      gesture = {
        type: "move",
        name,
        element,
        rect: { ...placement },
        visual: { ...placement },
        offsetX: event.clientX - bounds.left - placement.x,
        offsetY: event.clientY - bounds.top - placement.y,
        startedAt: performance.now(),
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        target: null,
      };
      element.classList.add("is-lifted");
      grid.classList.add("is-arranging");
      startTick();
    }
    document.body.classList.add("is-layout-gesture");
  });

  grid.addEventListener("click", (event) => {
    const close = event.target.closest(".tile-close");
    if (!close) return;
    const name = close.closest(".tile")?.dataset.module;
    if (name) removeModule(name);
  });

  for (const item of meta.values()) {
    item.chip?.addEventListener("click", () => {
      if (active.has(item.name)) {
        flash(item.name);
        return;
      }
      addModule(item.name);
    });
    item.chip?.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", item.name);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
      item.chip.classList.add("is-dragging");
    });
    item.chip?.addEventListener("dragend", () => item.chip.classList.remove("is-dragging"));
  }

  grid.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("text/plain")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    grid.classList.add("is-drop-target");
  });
  grid.addEventListener("dragleave", (event) => {
    if (!grid.contains(event.relatedTarget)) grid.classList.remove("is-drop-target");
  });
  grid.addEventListener("drop", (event) => {
    event.preventDefault();
    grid.classList.remove("is-drop-target");
    const name = event.dataTransfer?.getData("text/plain");
    if (name) addModule(name);
  });

  document.querySelectorAll(".directory-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".directory-button").forEach((other) => other.classList.remove("is-active"));
      button.classList.add("is-active");
      const filter = button.dataset.filter;
      for (const item of meta.values()) {
        item.element.classList.toggle("is-filtered", filter !== "all" && item.element.dataset.category !== filter);
      }
    });
  });

  const setRail = (open) => {
    body.classList.toggle("rail-open", open);
    railToggle?.setAttribute("aria-expanded", String(open));
    if (railScrim) railScrim.hidden = !open;
    if (open) window.setTimeout(fitRail, 40);
  };
  railToggle?.addEventListener("click", () => setRail(!body.classList.contains("rail-open")));
  railScrim?.addEventListener("click", () => setRail(false));
  taskReset?.addEventListener("click", reset);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setRail(false);
      cancelGesture();
    }
  });

  if (taskRun) {
    taskRun.addEventListener("click", () => document.getElementById("analyze-button")?.click());
  }
  if (taskExport) {
    taskExport.addEventListener("click", () => document.getElementById("download-button")?.click());
  }
  const analyzeButton = document.getElementById("analyze-button");
  const downloadButton = document.getElementById("download-button");
  const syncActions = () => {
    if (taskRun && analyzeButton) taskRun.disabled = analyzeButton.disabled;
    if (taskExport && downloadButton) taskExport.disabled = downloadButton.disabled;
  };
  if (analyzeButton) new MutationObserver(syncActions).observe(analyzeButton, { attributes: true, attributeFilter: ["disabled"] });
  if (downloadButton) new MutationObserver(syncActions).observe(downloadButton, { attributes: true, attributeFilter: ["disabled"] });
  syncActions();

  const autoDone = new Set();
  const autoWatch = (id, module) => {
    const target = document.getElementById(id);
    if (!target) return;
    const check = () => {
      if (target.hidden || autoDone.has(module)) return;
      if (addModule(module, { quiet: true })) autoDone.add(module);
    };
    new MutationObserver(check).observe(target, { attributes: true, attributeFilter: ["hidden"] });
    check();
  };
  autoWatch("channel-card", "channel");
  autoWatch("modulation-lab", "modulation");

  new MutationObserver(scheduleFit).observe(grid, { childList: true, subtree: true, characterData: true });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.setTimeout(fitRail, 30);
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      normalize();
      apply();
    }, 120);
  });

  const bootstrap = () => {
    restore();
    apply();
    fitRail();
    syncConditional();
    window.setTimeout(() => { fitTiles(); fitRail(); }, 120);
  };

  if (grid.clientWidth > 0 && grid.clientHeight > 0) bootstrap();
  else requestAnimationFrame(bootstrap);

  window.SignalInsightLayout = {
    ensure,
    addModule,
    removeModule,
    reset,
    syncConditional,
    fit: scheduleFit,
    refresh: () => { apply(); fitTiles(); },
  };
})();

(() => {
  const pairs = [
    ["#summary-info-button", "#summary-info-tip"],
    ["#result-info-button", "#result-info-tip"],
    ["#history-info-button", "#history-info-tip"],
    ["#stress-info-button", "#stress-info-tip"],
    ["#time-info-button", "#time-info-tip"],
    ["#spectrum-info-button", "#spectrum-info-tip"],
    ["#residual-info-button", "#residual-info-tip"],
    ["#evidence-info-button", "#evidence-info-tip"],
    ["#health-info-button", "#health-info-tip"],
  ];
  const closers = [];
  for (const [buttonSelector, tipSelector] of pairs) {
    const button = document.querySelector(buttonSelector);
    const tip = document.querySelector(tipSelector);
    if (!button || !tip) continue;
    let hovered = false;
    let focused = false;

    const place = () => {
      tip.hidden = false;
      const anchor = button.getBoundingClientRect();
      const rect = tip.getBoundingClientRect();
      const gap = 8;
      const left = Math.max(8, Math.min(anchor.right - rect.width, window.innerWidth - rect.width - 8));
      let top = anchor.bottom + gap;
      if (top + rect.height > window.innerHeight - 8) top = Math.max(8, anchor.top - gap - rect.height);
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
    };

    const sync = () => {
      if (hovered || focused) place();
      else tip.hidden = true;
    };

    closers.push(() => { hovered = false; focused = false; tip.hidden = true; });
    button.addEventListener("pointerenter", () => { hovered = true; sync(); });
    button.addEventListener("pointerleave", () => { hovered = false; sync(); });
    button.addEventListener("focus", () => { focused = true; sync(); });
    button.addEventListener("blur", () => { focused = false; sync(); });
    window.addEventListener("resize", () => { if (hovered || focused) place(); });
  }
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closers.forEach((close) => close());
  });
})();

/* ---------- History list compact / scroll ---------- */

(() => {
  const list = document.querySelector("#history-list");
  if (!list) return;
  const fit = () => {
    const items = list.querySelectorAll(".history-item");
    if (!items.length) {
      list.classList.remove("is-scrollable", "is-single");
      return;
    }
    const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    const itemHeight = items[0].offsetHeight;
    const twoFit = list.clientHeight >= itemHeight * 2 + gap - 0.5;
    list.classList.toggle("is-scrollable", twoFit);
    list.classList.toggle("is-single", !twoFit);
    if (!twoFit) list.scrollTop = 0;
  };
  new ResizeObserver(fit).observe(list);
  new MutationObserver(fit).observe(list, { childList: true });
  fit();
})();

/* ---------- Taskbar chip strip (vertical wheel → horizontal, glow indicator) ---------- */

(() => {
  const bar = document.querySelector(".taskbar");
  const strip = bar?.querySelector(".task-chips");
  const glow = bar?.querySelector(".task-glow");
  if (!bar || !strip || !glow) return;

  const maxScroll = () => strip.scrollWidth - strip.clientWidth;

  const sync = () => {
    const scrollable = maxScroll() > 2;
    bar.classList.toggle("has-chip-scroll", scrollable);
    if (!scrollable) return;
    const trackRect = strip.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const view = strip.clientWidth;
    const width = Math.max(28, (view / strip.scrollWidth) * view);
    const left = trackRect.left - barRect.left - bar.clientLeft + (strip.scrollLeft / strip.scrollWidth) * view;
    glow.style.width = `${Math.round(width)}px`;
    glow.style.transform = `translateX(${Math.round(left)}px)`;
  };

  strip.addEventListener("wheel", (event) => {
    if (event.ctrlKey || maxScroll() <= 2) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    const step = event.deltaMode === 1 ? delta * 32 : event.deltaMode === 2 ? delta * strip.clientWidth : delta;
    strip.scrollLeft += step;
  }, { passive: false });

  strip.addEventListener("scroll", sync, { passive: true });
  new ResizeObserver(sync).observe(strip);
  sync();
})();

/* ---------- Focus mode (double-click zoom) ---------- */

(() => {
  const layer = document.querySelector("#focus-layer");
  const scrim = document.querySelector("#focus-scrim");
  const exit = document.querySelector("#focus-exit");
  const grid = document.querySelector("#tile-grid");
  if (!layer || !scrim || !exit || !grid) return;

  const background = [".topbar", ".control-panel", ".workspace", ".taskbar"]
    .map((selector) => document.querySelector(selector))
    .filter(Boolean);

  const TIP_LABELS = {
    summary: "运行摘要",
    conclusion: "结论说明",
    history: "保存说明",
    stress: "压力测试说明",
    time: "图例",
    spectrum: "图例",
    residual: "图例",
    evidence: "边界与下一步",
  };

  let phase = "idle";
  let focused = null;
  let saved = null;
  let returnFocus = null;

  const targetRect = () => {
    const narrow = window.innerWidth < 760;
    const padX = narrow ? 8 : Math.round(Math.max(18, Math.min(64, window.innerWidth * 0.05)));
    const padY = narrow ? 8 : Math.round(Math.max(18, Math.min(52, window.innerHeight * 0.055)));
    return {
      left: padX,
      top: padY,
      width: window.innerWidth - padX * 2,
      height: window.innerHeight - padY * 2,
    };
  };

  const place = (rect) => {
    if (!focused) return;
    focused.style.left = `${Math.round(rect.left)}px`;
    focused.style.top = `${Math.round(rect.top)}px`;
    focused.style.width = `${Math.round(rect.width)}px`;
    focused.style.height = `${Math.round(rect.height)}px`;
  };

  const tileTitle = (tile) => tile.querySelector(".tile-head h3")?.textContent?.trim() || "模块";

  const buildExtra = (tile) => {
    const tipId = tile.querySelector(".result-info-button")?.getAttribute("aria-describedby");
    const tip = tipId ? document.getElementById(tipId) : null;
    if (!tip) return null;
    const extra = document.createElement("section");
    extra.className = "focus-extra";
    const caption = document.createElement("strong");
    const module = tile.dataset.module;
    if (module === "health") {
      caption.textContent = "实验设计摘要";
      const summary = document.querySelector("#design-tip-summary")?.textContent?.trim();
      const note = document.createElement("p");
      note.className = "focus-note";
      note.style.margin = "0";
      note.textContent = summary || "当前采样条件足以支撑本页演示。";
      extra.append(caption, note);
      return extra;
    }
    caption.textContent = TIP_LABELS[module] || "补充说明";
    extra.append(caption);
    for (const node of [...tip.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
      extra.append(node.cloneNode(true));
    }
    extra.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    return extra;
  };

  const open = (tile) => {
    if (phase !== "idle" || !tile || tile.hidden) return;
    phase = "open";
    focused = tile;
    returnFocus = document.activeElement;
    const rect = tile.getBoundingClientRect();
    const scale = tile.querySelector(".tile-scale");
    saved = {
      left: tile.style.left,
      top: tile.style.top,
      width: tile.style.width,
      height: tile.style.height,
      scaleStyle: scale?.getAttribute("style") ?? null,
      home: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    };
    // fit engine pins height:100%; content tiles release it so short content centers
    if (scale && !scale.classList.contains("chart-card")) scale.style.height = "auto";
    const extra = buildExtra(tile);
    if (extra) tile.querySelector(".tile-scale")?.append(extra);
    tile.classList.add("is-focused");
    tile.style.position = "absolute";
    tile.style.transition = "none";
    place(saved.home);
    layer.append(tile);
    layer.hidden = false;
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.setAttribute("aria-label", `${tileTitle(tile)}放大视图`);
    document.body.classList.add("is-focusing");
    for (const node of background) node.inert = true;
    void tile.offsetWidth;
    requestAnimationFrame(() => {
      tile.style.transition = "";
      layer.classList.add("is-visible");
      place(targetRect());
    });
    tile.focus({ preventScroll: true });
  };

  const finish = () => {
    const tile = focused;
    if (!tile) return;
    tile.classList.remove("is-focused");
    tile.style.transition = "none";
    tile.style.position = "";
    tile.style.left = saved.left;
    tile.style.top = saved.top;
    tile.style.width = saved.width;
    tile.style.height = saved.height;
    grid.append(tile);
    const scale = tile.querySelector(".tile-scale");
    if (scale) {
      if (saved.scaleStyle === null) scale.removeAttribute("style");
      else scale.setAttribute("style", saved.scaleStyle);
    }
    tile.querySelectorAll(".focus-extra").forEach((node) => node.remove());
    layer.hidden = true;
    layer.classList.remove("is-visible");
    layer.removeAttribute("role");
    layer.removeAttribute("aria-modal");
    layer.removeAttribute("aria-label");
    document.body.classList.remove("is-focusing");
    for (const node of background) node.inert = false;
    try { window.SignalInsightLayout?.refresh?.(); } catch { /* layout engine optional */ }
    void tile.offsetWidth;
    tile.style.transition = "";
    returnFocus?.focus?.({ preventScroll: true });
    phase = "idle";
    focused = null;
    saved = null;
    returnFocus = null;
  };

  const close = () => {
    if (phase !== "open" || !focused) return;
    phase = "close";
    layer.classList.remove("is-visible");
    if (saved) place(saved.home);
    window.setTimeout(finish, 400);
  };

  document.addEventListener("dblclick", (event) => {
    if (phase !== "idle") return;
    const tile = event.target.closest(".tile");
    if (!tile || tile.hidden || tile.closest("#focus-layer")) return;
    if (event.target.closest("button, a, input, select, textarea, label, .resize-handle")) return;
    event.preventDefault();
    open(tile);
  });

  document.addEventListener("keydown", (event) => {
    if (phase === "open" && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (phase !== "idle" || event.key !== "Enter") return;
    const tile = event.target.closest?.(".tile");
    if (!tile || tile.hidden || tile.closest("#focus-layer")) return;
    if (event.target.closest("button, a, input, select, textarea, label")) return;
    event.preventDefault();
    open(tile);
  });

  layer.addEventListener("click", (event) => {
    if (phase !== "open") return;
    if (event.target.closest(".tile.is-focused")) return;
    close();
  });

  window.addEventListener("resize", () => {
    if (phase === "open") place(targetRect());
  });
})();
