import {
  analyzeSignal,
  analyzeIqSignal,
  buildAiPayload,
  buildDecision,
  buildExperimentPlan,
  stressTest,
  templateExplanation,
} from "./dsp.js?v=7";
import { parseCsv } from "./csv.js?v=7";
import { parseMat } from "./mat.js?v=7";

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
  modulationLab: document.querySelector("#modulation-lab"),
  modulationType: document.querySelector("#modulation-type"),
  modulationChart: document.querySelector("#modulation-chart"),
  modulationFacts: document.querySelector("#modulation-facts"),
  modulationSidebands: document.querySelector("#modulation-sidebands"),
  stressButton: document.querySelector("#stress-button"),
  stressSummary: document.querySelector("#stress-summary"),
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
  timeLegend: document.querySelector("#time-legend"),
  toast: document.querySelector("#toast"),
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
const HISTORY_KEY = "signalinsight.history.v1";
const HISTORY_LIMIT = 20;

let toastTimer = null;

function showToast(message, error = false) {
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", error);
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3600);
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

let analyzerWorker = null;
let analyzerRequestId = 0;
let analysisSequence = 0;
const analyzerPending = new Map();
const ANALYZER_TIMEOUT_MS = 90000;

function getAnalyzerWorker() {
  if (analyzerWorker || typeof Worker === "undefined") return analyzerWorker;
  try {
    analyzerWorker = new Worker(new URL("./analyzer-worker.js?v=7", import.meta.url), { type: "module" });
    analyzerWorker.addEventListener("message", (event) => {
      const { id, ok, result, error } = event.data ?? {};
      const pending = analyzerPending.get(id);
      if (!pending) return;
      analyzerPending.delete(id);
      clearTimeout(pending.timeout);
      if (ok) pending.resolve(result);
      else pending.reject(new Error(error || "分析失败。"));
    });
    analyzerWorker.addEventListener("error", (event) => {
      const error = new Error(event.message || "分析 Worker 失败。");
      for (const pending of analyzerPending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      analyzerPending.clear();
      analyzerWorker?.terminate();
      analyzerWorker = null;
    });
  } catch {
    analyzerWorker = null;
  }
  return analyzerWorker;
}

function analyzeInWorker(worker, time, values, type = "analyze", baseline = null, qValues = null) {
  const id = ++analyzerRequestId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const entries = [...analyzerPending.values()];
      analyzerPending.clear();
      analyzerWorker?.terminate();
      analyzerWorker = null;
      const error = new Error("分析超时，请降低样本量或重试。");
      error.name = "AnalyzerTimeoutError";
      for (const pending of entries) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
    }, ANALYZER_TIMEOUT_MS);
    analyzerPending.set(id, { resolve, reject, timeout });
    try {
      worker.postMessage({ id, type, time, values, qValues, baseline });
    } catch (error) {
      analyzerPending.delete(id);
      clearTimeout(timeout);
      reject(error);
    }
  });
}

async function analyzeSignalSafely(time, values) {
  const worker = getAnalyzerWorker();
  if (!worker) {
    const result = analyzeSignal(time, values);
    result.engine = "main";
    return result;
  }
  try {
    const result = await analyzeInWorker(worker, time, values);
    result.engine = "worker";
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AnalyzerTimeoutError") throw error;
    const result = analyzeSignal(time, values);
    result.engine = "main";
    return result;
  }
}

async function analyzeIqSafely(time, iValues, qValues) {
  const worker = getAnalyzerWorker();
  if (!worker) {
    const result = analyzeIqSignal(time, iValues, qValues);
    result.engine = "main";
    return result;
  }
  try {
    const result = await analyzeInWorker(worker, time, iValues, "iq", null, qValues);
    result.engine = "worker";
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AnalyzerTimeoutError") throw error;
    const result = analyzeIqSignal(time, iValues, qValues);
    result.engine = "main";
    return result;
  }
}

async function stressTestSafely(time, values, baseline) {
  const worker = getAnalyzerWorker();
  if (!worker) return stressTest(time, values, baseline);
  try {
    return await analyzeInWorker(worker, time, values, "stress", baseline);
  } catch (error) {
    if (error instanceof Error && error.name === "AnalyzerTimeoutError") throw error;
    return stressTest(time, values, baseline);
  }
}

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
  elements.stressSummary.textContent = "等待当前分析完成。";
  elements.stressList.replaceChildren();
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
    elements.stressSummary.textContent = "等待当前分析完成。";
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
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("evidence-flash");
    setTimeout(() => row.classList.remove("evidence-flash"), 1800);
  }
  const chartId = EVIDENCE_CHARTS[id];
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

  const plan = buildExperimentPlan(result);
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
  elements.stressList.replaceChildren(...result.variants.map((variant) => {
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
  elements.stressSummary.textContent = "正在生成扰动场景并重新分析…";
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
    elements.stressSummary.textContent = result.summary;
    renderStress(result);
  } catch (error) {
    if (!state.resultStale) {
      elements.stressSummary.textContent = error instanceof Error ? error.message : "压力测试失败。";
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
  elements.stressSummary.textContent = result.kind === "iq"
    ? "IQ 模式暂不支持反事实压力测试。"
    : stressAvailable
      ? "加噪、缩短观测、降采样，观察推荐模型是否翻转。"
      : "压力测试仅支持 5 万点以内，避免多轮分析过慢。";
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

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

function chartPalette() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: styles.getPropertyValue("--site-muted").trim() || "#8aa09a",
    grid: styles.getPropertyValue("--site-border").trim() || "rgba(169,213,196,.15)",
    accent: styles.getPropertyValue("--site-accent").trim() || "#56e3a5",
    warn: styles.getPropertyValue("--warn").trim() || "#f7bc63",
    cyan: styles.getPropertyValue("--cyan").trim() || "#77d7ff",
  };
}

function drawPlot(canvas, x, lines, { fill = false, markers = [], xLabel = "", yLabel = "" } = {}) {
  const { context, width, height } = setupCanvas(canvas);
  const palette = chartPalette();
  const margin = { left: 49, right: 12, top: 18, bottom: 28 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  context.clearRect(0, 0, width, height);
  const values = lines.flatMap((line) => line.values).filter(Number.isFinite);
  if (!x.length || !values.length) return;
  let xMin = Math.min(...x);
  let xMax = Math.max(...x);
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  const yPad = Math.max((yMax - yMin) * 0.1, 1e-9);
  yMin -= yPad;
  yMax += yPad;
  const xScale = (value) => margin.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
  const yScale = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  context.font = "10px Cascadia Code, Consolas, monospace";
  context.lineWidth = 1;
  for (let index = 0; index <= 4; index += 1) {
    const y = margin.top + (plotHeight * index) / 4;
    context.strokeStyle = palette.grid;
    context.beginPath();
    context.moveTo(margin.left, y);
    context.lineTo(width - margin.right, y);
    context.stroke();
    context.fillStyle = palette.text;
    const value = yMax - ((yMax - yMin) * index) / 4;
    context.fillText(formatNumber(value, 2), 4, y + 3);
  }
  context.fillStyle = palette.text;
  context.fillText(formatNumber(xMin, 3), margin.left, height - 7);
  const rightLabel = formatNumber(xMax, 3);
  context.fillText(rightLabel, width - margin.right - context.measureText(rightLabel).width, height - 7);
  if (xLabel) context.fillText(xLabel, margin.left + plotWidth / 2 - 12, height - 7);
  if (yLabel) context.fillText(yLabel, 4, 10);

  for (const line of lines) {
    const points = line.values.map((value, index) => ({
      x: xScale(x[index]),
      y: yScale(value),
    }));
    if (fill) {
      context.beginPath();
      context.moveTo(points[0].x, margin.top + plotHeight);
      for (const point of points) context.lineTo(point.x, point.y);
      context.lineTo(points.at(-1).x, margin.top + plotHeight);
      context.closePath();
      const gradient = context.createLinearGradient(0, margin.top, 0, margin.top + plotHeight);
      gradient.addColorStop(0, colorWithAlpha(palette.cyan, 0.22));
      gradient.addColorStop(1, colorWithAlpha(palette.cyan, 0.01));
      context.fillStyle = gradient;
      context.fill();
    }
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.strokeStyle = line.color === "accent" ? palette.accent : line.color === "warn" ? palette.warn : palette.cyan;
    context.lineWidth = line.width || 1.4;
    context.lineJoin = "round";
    context.stroke();
  }
  markers.forEach((marker, index) => {
    const px = xScale(marker.x);
    const py = yScale(marker.y);
    context.strokeStyle = colorWithAlpha(palette.warn, 0.5);
    context.setLineDash([3, 4]);
    context.beginPath();
    context.moveTo(px, margin.top);
    context.lineTo(px, margin.top + plotHeight);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = palette.warn;
    context.beginPath();
    context.arc(px, py, 3, 0, Math.PI * 2);
    context.fill();
    if (index < 3) {
      context.fillStyle = palette.text;
      context.fillText(`${marker.label}`, Math.min(px + 5, width - 74), margin.top + 12 + index * 13);
    }
  });
}

function colorWithAlpha(color, alpha) {
  if (!color.startsWith("#")) return `rgba(119,215,255,${alpha})`;
  const value = color.slice(1);
  const bigint = parseInt(value.length === 3 ? value.split("").map((char) => char + char).join("") : value, 16);
  return `rgba(${(bigint >> 16) & 255},${(bigint >> 8) & 255},${bigint & 255},${alpha})`;
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
  try {
    const response = await fetch("/functions/v1/app/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    state.aiConfigured = Boolean(response.ok && data?.configured);
    state.aiHealth = state.aiConfigured ? "configured" : "not_configured";
  } catch {
    state.aiConfigured = false;
    state.aiHealth = "unreachable";
  }
  if (state.result && !state.resultStale) renderLocalExplanation(state.result);
}

const AI_ERROR_MESSAGES = {
  service_not_configured: "Qwen 密钥尚未配置，继续显示确定性规则解释。",
  upstream_error: "Qwen 上游返回错误，请检查 Key、模型名或额度。",
  upstream_unavailable: "Qwen 服务暂时不可用，请稍后重试。",
  invalid_model_output: "Qwen 返回格式不符合要求，请重试。",
  invalid_upstream_response: "Qwen 返回内容异常，请重试。",
  payload_too_large: "发送给 Qwen 的摘要过大，请减少数据量。",
  invalid_payload: "发送给 Qwen 的摘要格式无效。",
  invalid_json: "请求格式错误。",
  rate_limited: "请求过于频繁，请稍后再试。",
};

async function requestQwenExplanation() {
  if (!state.result || state.resultStale || state.busy || !state.aiConfigured) return;
  const requestId = ++state.aiRequestSequence;
  const version = state.resultVersion;
  const payload = buildAiPayload(state.result);
  const cacheKey = JSON.stringify(payload);
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
    const response = await fetch("/functions/v1/app/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || !data?.explanation) {
      throw new Error(AI_ERROR_MESSAGES[data?.error] ?? "Qwen 暂不可用，继续显示确定性规则解释。");
    }
    if (requestId !== state.aiRequestSequence || version !== state.resultVersion || state.resultStale) return;
    const explanation = data.explanation;
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
  const result = state.result;
  const report = {
    product: "SignalInsight",
    version: "0.1.0-sites",
    generatedAt: new Date().toISOString(),
    source: state.sourceLabel,
    sampleCount: result.sampleCount,
    sampleRateHz: result.sampleRate,
    durationSeconds: result.duration,
    kind: result.kind,
    recommendedModel: result.recommendedId,
    unknown: result.unknown,
    reliability: result.reliability,
    health: result.health,
    experimentPlan: buildExperimentPlan(result),
    modulation: result.best?.modulationView
      ? {
          type: result.best.modulationView.type,
          carrierFrequency: result.best.modulationView.carrierFrequency,
          modulationFrequency: result.best.modulationView.modulationFrequency,
          modulationIndex: result.best.modulationView.modulationIndex,
          frequencyDeviation: result.best.modulationView.frequencyDeviation ?? null,
          sidebands: result.best.modulationView.sidebands,
        }
      : null,
    candidates: result.candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      parameters: candidate.parameters,
      metrics: candidate.metrics,
      residualAnalysis: candidate.residualAnalysis,
    })),
    method: {
      spectrum: "Hann-windowed FFT",
      fitting: "variable projection + golden-section frequency refinement",
      selection: "BIC with residual evidence",
    },
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `signalinsight-report-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("报告已导出；包含参数、证据与方法边界。");
}

function summarizeResult(result, source) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    source,
    kind: result.kind,
    modelLabel: result.unknown ? "暂不推荐模型" : (result.best?.label ?? "—"),
    unknown: result.unknown,
    reliabilityLevel: result.reliability.level,
    reliabilityLabel: result.reliability.label,
    sampleCount: result.sampleCount,
    sampleRate: result.sampleRate,
    healthStatus: result.health.status,
    bicGap: result.reliability.bicGap ?? null,
    parameters: (result.unknown ? [] : (result.best?.parameters ?? [])).map((parameter) => ({
      label: parameter.label,
      value: parameter.value,
      unit: parameter.unit,
      sigma: parameter.sigma ?? null,
      sigmaKind: parameter.sigmaKind ?? null,
    })),
  };
}

function persistHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  } catch {
    showToast("本地历史保存失败（存储空间不足或被禁用）。", true);
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.history = Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry === "object" && entry.createdAt && entry.source).slice(0, HISTORY_LIMIT)
      : [];
  } catch {
    state.history = [];
  }
  renderHistory();
}

function saveHistory(result, source) {
  state.history.unshift(summarizeResult(result, source));
  state.history = state.history.slice(0, HISTORY_LIMIT);
  persistHistory();
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
  persistHistory();
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
  bindEvents();
  loadHistory();
  state.data = buildExample("single");
  elements.tabs[0].classList.add("active");
  analyzeCurrent();
  checkAiAvailability();
}

init();
