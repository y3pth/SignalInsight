import { analyzeSignal, analyzeIqSignal } from "./dsp.js?v=13";

const TAU = 2 * Math.PI;

function seededNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

export function synthesizeSignal(params) {
  const fs = params.fs;
  const n = params.n;
  const random = seededNoise(params.seed ?? 1);
  const duration = (n - 1) / fs;
  const jitter = params.jitterPercent ? params.jitterPercent / 100 : 0;
  const time = Array.from({ length: n }, (_, index) =>
    index / fs + (jitter ? (random() - 0.5) * 2 * jitter / fs : 0),
  );
  if (params.waveform === "iq") {
    const i = time.map((t) => (params.iOffset ?? 0) + params.amplitude * Math.cos(TAU * params.carrierFrequency * t + (params.phase ?? 0)) + (params.noiseSigma ? params.noiseSigma * gaussian(random) : 0));
    const q = time.map((t) => (params.qOffset ?? 0) + params.amplitude * Math.sin(TAU * params.carrierFrequency * t + (params.phase ?? 0)) + (params.noiseSigma ? params.noiseSigma * gaussian(random) : 0));
    return { kind: "iq", time, i, q };
  }
  const values = time.map((t) => {
    let value = params.offset ?? 0;
    switch (params.waveform ?? "tones") {
      case "am":
        value += params.carrierAmplitude * (1 + params.modulationIndex * Math.cos(TAU * params.modulationFrequency * t + (params.modulationPhase ?? 0))) * Math.cos(TAU * params.carrierFrequency * t + (params.carrierPhase ?? 0));
        break;
      case "fm":
        value += params.carrierAmplitude * Math.cos(TAU * params.carrierFrequency * t + params.modulationIndex * Math.sin(TAU * params.modulationFrequency * t + (params.modulationPhase ?? 0)) + (params.carrierPhase ?? 0));
        break;
      case "chirp": {
        const rate = (params.endFrequency - params.startFrequency) / (2 * duration);
        value += params.amplitude * Math.sin(TAU * (params.startFrequency * t + rate * t * t));
        break;
      }
      case "drift":
        for (const component of params.components ?? []) value += component.amplitude * Math.sin(TAU * component.frequency * t + (component.phase ?? 0));
        value += (params.driftEnd ?? 0) * (t / duration);
        break;
      case "noise":
        break;
      default:
        for (const component of params.components ?? []) value += component.amplitude * Math.sin(TAU * component.frequency * t + (component.phase ?? 0));
    }
    if (params.noiseSigma) value += params.noiseSigma * gaussian(random);
    if (params.quantizeBits) {
      const step = (2 * params.quantizeRange) / 2 ** params.quantizeBits;
      value = Math.round(value / step) * step;
    }
    if (params.clip != null) value = Math.max(-params.clip, Math.min(params.clip, value));
    return value;
  });
  return { kind: params.kind ?? "real", time, values };
}

export const CONDITION_CATALOG = [
  { id: "clean", label: "干净单频", description: "低噪声单频正弦，可靠辨识。" },
  { id: "noisy", label: "含噪单频", description: "中等噪声，模型可辨但可信度下降。" },
  { id: "clipped", label: "削顶失真", description: "幅值超量程被削顶，引入谐波。" },
  { id: "quantized", label: "粗量化", description: "低分辨率 ADC 量化，阶梯失真。" },
  { id: "drift", label: "直流漂移", description: "基线缓慢漂移，污染拟合。" },
  { id: "jitter", label: "采样抖动", description: "采样时刻抖动（容差内）。" },
  { id: "aliasing", label: "混叠（超 Nyquist）", description: "真实频率超 fs/2，分析得到混叠假频。" },
  { id: "near-nyquist", label: "近 Nyquist", description: "频率接近 fs/2，采样裕量不足。" },
  { id: "short", label: "短观测", description: "样本极少，频率分辨率粗。" },
  { id: "multi", label: "多频叠加", description: "多个频率成分叠加。" },
  { id: "am", label: "调幅 AM", description: "载波幅值随调制变化。" },
  { id: "fm", label: "调频 FM", description: "瞬时频率随调制变化。" },
  { id: "iq", label: "IQ 复指数", description: "I/Q 两路复信号。" },
  { id: "chirp", label: "扫频 chirp", description: "频率随时间扫过，库外信号。" },
  { id: "noise", label: "纯噪声", description: "无确定性信号。" },
  { id: "invalid-short", label: "边界：样本不足", description: "少于 64 样本，应被拒绝。" },
  { id: "invalid-jitter", label: "边界：抖动超限", description: "抖动超 5%，应被拒绝。" },
];

const CONDITION_IDS = CONDITION_CATALOG.map((item) => item.id);

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function range(random, min, max) {
  return min + (max - min) * random();
}

export function randomSignalParams(options = {}) {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const random = seededNoise(seed);
  let condition = options.condition ?? "random";
  if (condition === "random") condition = pick(random, CONDITION_IDS);
  const fs = options.fs ?? pick(random, [1000, 1024, 2000, 4096]);
  const nyquist = fs / 2;
  const baseN = options.n ?? pick(random, [512, 1024, 2048, 4096]);
  const amplitude = range(random, 1, 2.5);
  const toneFrequency = range(random, 10, 0.35 * fs);
  const base = { kind: "real", waveform: "tones", fs, n: baseN, seed, offset: range(random, -0.3, 0.3), noiseSigma: amplitude * 0.01, components: [{ frequency: toneFrequency, amplitude, phase: range(random, 0, TAU) }] };

  switch (condition) {
    case "clean":
      return { ...base, condition, noiseSigma: amplitude * range(random, 0.005, 0.02) };
    case "noisy":
      return { ...base, condition, noiseSigma: amplitude * range(random, 0.3, 0.7) };
    case "clipped":
      return { ...base, condition, noiseSigma: 0, clip: amplitude * range(random, 0.3, 0.7) };
    case "quantized":
      return { ...base, condition, noiseSigma: 0, components: [{ frequency: range(random, 10, 0.2 * fs), amplitude, phase: 0 }], quantizeBits: pick(random, [3, 4, 5]), quantizeRange: amplitude * range(random, 1.0, 1.4) };
    case "drift":
      return { ...base, condition, waveform: "drift", noiseSigma: amplitude * 0.02, driftEnd: amplitude * range(random, 1.5, 3) };
    case "jitter":
      return { ...base, condition, jitterPercent: range(random, 1, 4) };
    case "aliasing":
      return { ...base, condition, noiseSigma: amplitude * 0.01, components: [{ frequency: fs * range(random, 0.6, 0.9), amplitude, phase: range(random, 0, TAU) }] };
    case "near-nyquist":
      return { ...base, condition, noiseSigma: amplitude * 0.01, components: [{ frequency: fs * range(random, 0.45, 0.495), amplitude, phase: range(random, 0, TAU) }] };
    case "short":
      return { ...base, condition, n: 64, noiseSigma: amplitude * 0.02 };
    case "multi": {
      const f1 = range(random, 20, 0.2 * fs);
      const f2 = f1 + range(random, 0.1 * fs, 0.2 * fs);
      return { ...base, condition, components: [{ frequency: f1, amplitude, phase: range(random, 0, TAU) }, { frequency: Math.min(f2, 0.45 * fs), amplitude: amplitude * range(random, 0.4, 0.8), phase: range(random, 0, TAU) }] };
    }
    case "am":
      return { ...base, condition, waveform: "am", carrierFrequency: range(random, 0.1 * fs, 0.3 * fs), carrierAmplitude: amplitude, carrierPhase: range(random, 0, TAU), modulationFrequency: range(random, 2, 10), modulationIndex: range(random, 0.3, 0.9), modulationPhase: range(random, 0, TAU), noiseSigma: 0.02 };
    case "fm":
      return { ...base, condition, waveform: "fm", carrierFrequency: range(random, 0.1 * fs, 0.3 * fs), carrierAmplitude: amplitude, carrierPhase: range(random, 0, TAU), modulationFrequency: range(random, 2, 8), modulationIndex: range(random, 1, 3), modulationPhase: range(random, 0, TAU), noiseSigma: 0.02 };
    case "iq":
      return { ...base, condition, kind: "iq", waveform: "iq", carrierFrequency: range(random, 0.1 * fs, 0.3 * fs), amplitude, phase: range(random, 0, TAU), iOffset: range(random, -0.2, 0.2), qOffset: range(random, -0.2, 0.2), noiseSigma: 0.01 };
    case "chirp":
      return { ...base, condition, waveform: "chirp", startFrequency: range(random, 10, 0.1 * fs), endFrequency: range(random, 0.3 * fs, 0.45 * fs), amplitude, noiseSigma: 0.02 };
    case "noise":
      return { ...base, condition, waveform: "noise", components: [], noiseSigma: range(random, 0.5, 2) };
    case "invalid-short":
      return { ...base, condition, n: 63 };
    case "invalid-jitter":
      return { ...base, condition, jitterPercent: range(random, 6, 10) };
    default:
      return { ...base, condition };
  }
}

export function describeConditions(params) {
  const nyquist = params.fs / 2;
  const conditions = [];
  const groundTruth = { fs: params.fs, n: params.n, nyquist, waveform: params.waveform ?? "tones", kind: params.kind ?? "real" };
  const primary = params.components?.[0];
  if (primary) {
    groundTruth.frequency = primary.frequency;
    groundTruth.amplitude = primary.amplitude;
  }
  if (params.components?.length > 1) groundTruth.components = params.components.map((c) => ({ frequency: c.frequency, amplitude: c.amplitude }));
  if (params.waveform === "am" || params.waveform === "fm" || params.waveform === "iq") {
    groundTruth.carrierFrequency = params.carrierFrequency;
    groundTruth.amplitude = params.carrierAmplitude ?? params.amplitude;
    if (params.modulationFrequency) groundTruth.modulationFrequency = params.modulationFrequency;
    if (params.modulationIndex != null) groundTruth.modulationIndex = params.modulationIndex;
  }
  if (params.waveform === "chirp") {
    groundTruth.startFrequency = params.startFrequency;
    groundTruth.endFrequency = params.endFrequency;
  }
  if (params.noiseSigma) conditions.push(`加性高斯噪声 σ=${params.noiseSigma.toFixed(3)}`);
  if (params.clip != null) conditions.push(`削顶/饱和：限幅 ±${params.clip.toFixed(3)}`);
  if (params.quantizeBits) conditions.push(`ADC 量化：${params.quantizeBits}-bit，量程 ±${params.quantizeRange}`);
  if (params.driftEnd) conditions.push(`基线漂移：0 → ${params.driftEnd.toFixed(3)}`);
  if (params.jitterPercent) conditions.push(`采样抖动：±${params.jitterPercent.toFixed(2)}%${params.jitterPercent > 5 ? "（超 5% 容差）" : ""}`);
  if (primary && primary.frequency > nyquist) conditions.push(`真实频率 ${primary.frequency.toFixed(1)} Hz 超 Nyquist ${nyquist} Hz（将发生混叠）`);
  else if (primary && primary.frequency > 0.9 * nyquist) conditions.push(`频率 ${primary.frequency.toFixed(1)} Hz 接近 Nyquist ${nyquist} Hz`);
  if (params.n < 128) conditions.push(`短观测：仅 ${params.n} 样本，分辨率约 ${(params.fs / params.n).toFixed(1)} Hz`);
  if (params.waveform === "noise") conditions.push("纯噪声，无确定性信号");
  if (params.waveform === "chirp") conditions.push("扫频信号，候选库外");
  return { groundTruth, conditions };
}

export function generateRandomSignal(options = {}) {
  const params = options.params ?? randomSignalParams(options);
  const { groundTruth, conditions } = describeConditions(params);
  const data = synthesizeSignal(params);
  return { params, groundTruth, conditions, data };
}

function aliasFrequency(trueFrequency, fs) {
  return Math.abs(trueFrequency - Math.round(trueFrequency / fs) * fs);
}

export function classifyOutcome(result, params, groundTruth, error) {
  if (error) {
    return { verdict: "input-rejected", rejected: true, unknown: null, reliability: null, model: null, healthIssues: [], aliasing: false, notes: [`输入被拒绝：${error.message}`, "这是预期的边界保护，说明数据不满足分析前提。"] };
  }
  const nyquist = params.fs / 2;
  const healthIssues = result.health.checks.filter((check) => check.status !== "pass").map((check) => `${check.label}：${check.detail}`);
  const notes = [];
  const modelFrequency = result.best?.parameters.find((parameter) => parameter.id === "frequency_1")?.value ?? null;
  let aliasing = false;
  let frequencyError = null;

  if (groundTruth.frequency != null && groundTruth.frequency > nyquist && modelFrequency != null) {
    const alias = aliasFrequency(groundTruth.frequency, params.fs);
    if (Math.abs(modelFrequency - alias) < Math.max(1, params.fs / params.n)) {
      aliasing = true;
      notes.push(`混叠：真实频率 ${groundTruth.frequency.toFixed(1)} Hz 超 Nyquist ${nyquist} Hz，分析得到假频 ${modelFrequency.toFixed(1)} Hz（≈理论混叠 ${alias.toFixed(1)} Hz）。`);
      notes.push("从采样数据本身无法区分真频与混叠假频；需提高采样率或抗混叠滤波。系统对此假频仍可能判可靠，这是采样定理的固有局限。");
    }
  }
  if (!aliasing && groundTruth.frequency != null && modelFrequency != null && result.recommendedId === "single_tone") {
    frequencyError = Math.abs(modelFrequency - groundTruth.frequency);
  }

  let verdict;
  if (aliasing) {
    verdict = "aliasing-warning";
  } else if (result.unknown) {
    verdict = "unknown-rejected";
    notes.push("证据不足，系统拒绝给出模型结论（无显著谱峰 / R² 过低 / 候选库外）。");
    if (params.waveform === "noise") notes.push("纯噪声无确定性成分，拒绝结论是正确行为。");
    if (params.waveform === "chirp") notes.push("扫频信号超出定频/调制候选库，拒绝结论体现诚实边界。");
  } else if (result.reliability.level === "unreliable") {
    verdict = "unreliable-defect";
    notes.push(`识别出模型 ${result.best?.label ?? ""}，但数据缺陷使结论不可信。`);
    notes.push(...healthIssues);
  } else if (result.reliability.level === "caution") {
    verdict = "caution-boundary";
    notes.push(`模型 ${result.best?.label ?? ""} 可用但需谨慎。`);
    notes.push(...healthIssues);
  } else {
    verdict = "correct-model";
    notes.push(`可靠识别：${result.best?.label ?? ""}。`);
    if (frequencyError != null) notes.push(`频率估计误差 ${frequencyError.toFixed(3)} Hz（真值 ${groundTruth.frequency.toFixed(2)} Hz）。`);
  }

  return { verdict, rejected: false, unknown: result.unknown, reliability: result.reliability.level, model: result.recommendedId, modelFrequency, healthIssues, aliasing, frequencyError, notes };
}

export function runExperiment(options = {}) {
  const params = options.params ?? randomSignalParams(options);
  const { groundTruth, conditions } = describeConditions(params);
  try {
    const data = synthesizeSignal(params);
    const result = data.kind === "iq"
      ? analyzeIqSignal(data.time, data.i, data.q)
      : analyzeSignal(data.time, data.values);
    return { params, groundTruth, conditions, data, result, outcome: classifyOutcome(result, params, groundTruth, null) };
  } catch (error) {
    return { params, groundTruth, conditions, data: null, result: null, outcome: classifyOutcome(null, params, groundTruth, error) };
  }
}