import {
  analyzeSignal,
  buildAiPayload,
  templateExplanation,
} from "./dsp.js";

const elements = {
  tabs: [...document.querySelectorAll(".source-tab")],
  file: document.querySelector("#csv-file"),
  mapping: document.querySelector("#mapping-panel"),
  timeColumn: document.querySelector("#time-column"),
  signalColumn: document.querySelector("#signal-column"),
  analyze: document.querySelector("#analyze-button"),
  download: document.querySelector("#download-button"),
  recommendation: document.querySelector("#recommended-model"),
  reliability: document.querySelector("#reliability-badge"),
  subtitle: document.querySelector("#result-subtitle"),
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
};

const state = {
  data: null,
  sourceLabel: "内置单频样例",
  uploadedColumns: null,
  result: null,
  busy: false,
  aiConfigured: false,
};

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

function parseDelimitedLine(line, delimiter) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current);
  return values;
}

function detectDelimiter(line) {
  const candidates = [",", "\t", ";"];
  const counts = candidates.map((delimiter) => ({
    delimiter,
    count: parseDelimitedLine(line, delimiter).length,
  }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0].count > 1 ? counts[0].delimiter : null;
}

function parseCsv(text) {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 3) throw new Error("CSV 至少需要表头和两行数据。");
  const delimiter = detectDelimiter(lines[0]);
  if (!delimiter) throw new Error("无法识别 CSV 分隔符，请使用逗号、制表符或分号。");
  const headers = parseDelimitedLine(lines[0], delimiter).map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("CSV 存在空表头。");
  if (new Set(headers).size !== headers.length) throw new Error("CSV 存在重复表头。");
  const rows = lines.slice(1).map((line, index) => {
    const row = parseDelimitedLine(line, delimiter);
    if (row.length !== headers.length) {
      throw new Error(`第 ${index + 2} 行字段数与表头不一致。`);
    }
    return row;
  });
  const numericColumns = [];
  headers.forEach((header, columnIndex) => {
    const values = rows.map((row) => Number(row[columnIndex]));
    if (values.every((value) => Number.isFinite(value) && rowNotEmpty(rows, columnIndex))) {
      numericColumns.push({ header, values });
    }
  });
  if (numericColumns.length < 2) throw new Error("未找到两个以上完整数值列。");
  const timeCandidate =
    numericColumns.find((column) =>
      column.values.every((value, index) => index === 0 || value > column.values[index - 1]),
    ) ?? numericColumns[0];
  const signalCandidate = numericColumns.find((column) => column !== timeCandidate);
  return { headers, numericColumns, timeCandidate, signalCandidate };
}

function rowNotEmpty(rows, columnIndex) {
  return rows.every((row) => String(row[columnIndex] ?? "").trim() !== "");
}

function populateMapping(parsed, filename) {
  const options = parsed.numericColumns
    .map((column) => `<option value="${escapeHtml(column.header)}">${escapeHtml(column.header)}</option>`)
    .join("");
  elements.timeColumn.innerHTML = options;
  elements.signalColumn.innerHTML = options;
  elements.timeColumn.value = parsed.timeCandidate.header;
  elements.signalColumn.value = parsed.signalCandidate.header;
  elements.mapping.hidden = false;
  state.uploadedColumns = parsed.numericColumns;
  state.sourceLabel = `上传数据 · ${filename}`;
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
  const signalHeader = elements.signalColumn.value;
  if (timeHeader === signalHeader) throw new Error("时间列与信号列不能相同。");
  const timeColumn = state.uploadedColumns.find((column) => column.header === timeHeader);
  const signalColumn = state.uploadedColumns.find((column) => column.header === signalHeader);
  if (!timeColumn || !signalColumn) throw new Error("字段映射无效。");
  return {
    time: timeColumn.values,
    values: signalColumn.values,
    label: `${state.sourceLabel} · 时间 ${timeHeader} / 信号 ${signalHeader}`,
  };
}

function setBusy(busy) {
  state.busy = busy;
  elements.analyze.disabled = busy;
  elements.analyze.querySelector("span").textContent = busy ? "正在拟合与比较…" : "运行可信分析";
}

function analyzeCurrent() {
  try {
    setBusy(true);
    const data = selectedSignal();
    const started = performance.now();
    const result = analyzeSignal(data.time, data.values);
    result.elapsedMs = performance.now() - started;
    state.result = result;
    state.sourceLabel = data.label;
    render(result);
    showToast(`分析完成 · ${Math.round(result.elapsedMs)} ms · ${data.label}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "分析失败。", true);
  } finally {
    setBusy(false);
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
    : `${result.reliability.evidence.filter((item) => item.status === "pass").length}/${result.reliability.evidence.length} 项证据通过 · 模型只在候选库内竞争 · ${Math.round(result.elapsedMs)} ms`;
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
    cell.colSpan = 3;
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
    row.append(label, value, unit);
    elements.parameterBody.append(row);
  }
}

function renderEvidence(result) {
  elements.evidenceList.replaceChildren();
  for (const item of result.reliability.evidence) {
    const row = document.createElement("div");
    row.className = "evidence-item";
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

function renderLocalExplanation(result) {
  const explanation = templateExplanation(result);
  elements.aiSummary.textContent = explanation.summary;
  elements.aiObservations.replaceChildren(...explanation.observations.slice(0, 4).map((text) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    return paragraph;
  }));
  renderAiLimitations(explanation.limitations);
  elements.aiStatus.textContent = state.aiConfigured
    ? "AI 不参与参数计算，也不能修改可信等级。"
    : "当前显示确定性解释；配置 DASHSCOPE_API_KEY 后可启用 Qwen。";
  elements.aiButton.disabled = !state.aiConfigured;
  elements.aiButton.textContent = state.aiConfigured ? "用 Qwen 深入解释" : "Qwen 尚未配置";
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
  elements.timeLegend.textContent = "局部 0.12 s · 观测 / 拟合";
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
  } catch {
    state.aiConfigured = false;
  }
  if (state.result) renderLocalExplanation(state.result);
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
};

async function requestQwenExplanation() {
  if (!state.result || state.busy || !state.aiConfigured) return;
  elements.aiButton.disabled = true;
  elements.aiButton.textContent = "Qwen 正在解释…";
  elements.aiStatus.textContent = "正在发送结构化数值摘要，不包含原始序列。";
  try {
    const response = await fetch("/functions/v1/app/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAiPayload(state.result)),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || !data?.explanation) {
      throw new Error(AI_ERROR_MESSAGES[data?.error] ?? "Qwen 暂不可用，继续显示确定性规则解释。");
    }
    const explanation = data.explanation;
    elements.aiSummary.textContent = String(explanation.summary ?? "").slice(0, 2200);
    const observations = Array.isArray(explanation.observations) ? explanation.observations : [];
    elements.aiObservations.replaceChildren(...observations.slice(0, 6).map((text) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = String(text).slice(0, 500);
      return paragraph;
    }));
    renderAiLimitations(explanation.limitations);
    elements.aiStatus.textContent = "Qwen 仅解释已计算证据，未修改任何数值结论。";
    elements.aiButton.textContent = "重新生成解释";
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    elements.aiStatus.textContent = timedOut
      ? "Qwen 响应超时，请重试。"
      : error instanceof Error ? error.message : "Qwen 暂不可用。";
    elements.aiButton.textContent = "重试 Qwen 解释";
  } finally {
    elements.aiButton.disabled = false;
  }
}

function downloadReport() {
  if (!state.result) return;
  const result = state.result;
  const report = {
    product: "SignalInsight",
    version: "0.1.0-sites",
    generatedAt: new Date().toISOString(),
    source: state.sourceLabel,
    sampleCount: result.sampleCount,
    sampleRateHz: result.sampleRate,
    durationSeconds: result.duration,
    recommendedModel: result.recommendedId,
    unknown: result.unknown,
    reliability: result.reliability,
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

function bindEvents() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      elements.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      state.uploadedColumns = null;
      elements.mapping.hidden = true;
      state.data = buildExample(tab.dataset.example);
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
    try {
      const parsed = parseCsv(await file.text());
      elements.tabs.forEach((tab) => tab.classList.remove("active"));
      populateMapping(parsed, file.name);
      showToast("CSV 已载入，请确认字段映射后运行分析。");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "CSV 解析失败。", true);
    } finally {
      event.target.value = "";
    }
  });

  elements.analyze.addEventListener("click", analyzeCurrent);
  elements.download.addEventListener("click", downloadReport);
  elements.aiButton.addEventListener("click", requestQwenExplanation);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.result) renderCharts(state.result);
    }, 150);
  });
}

function init() {
  bindEvents();
  state.data = buildExample("single");
  elements.tabs[0].classList.add("active");
  analyzeCurrent();
  checkAiAvailability();
}

init();
