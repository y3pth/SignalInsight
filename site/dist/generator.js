import { analyzeSignal, analyzeIqSignal } from "./dsp.js?v=15";

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
  if (params.duplicateTime && n > 2) time[1] = time[0];
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
  if (params.dropout) {
    const start = Math.floor(params.dropout.startFraction * n);
    const end = Math.floor(params.dropout.endFraction * n);
    for (let index = start; index < end; index += 1) values[index] = 0;
  }
  if (params.spikes) {
    for (let index = 0; index < params.spikes.count; index += 1) {
      const at = Math.floor(random() * n);
      values[at] += params.spikes.amplitude * (random() > 0.5 ? 1 : -1);
    }
  }
  if (params.nanCount) {
    for (let index = 0; index < params.nanCount; index += 1) values[Math.floor(random() * n)] = NaN;
  }
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
  { id: "harmonics", label: "谐波失真", description: "基波加二/三次谐波，放大器非线性。" },
  { id: "spike", label: "脉冲干扰", description: "稀疏大幅尖峰，EMI 干扰。" },
  { id: "dropout", label: "信号掉零", description: "一段数据缺失置零，传感器掉线。" },
  { id: "close-tones", label: "近频拍频", description: "两个相近频率，分辨挑战。" },
  { id: "over-modulation", label: "AM 过调制", description: "调制指数 >1，包络失真。" },
  { id: "weak-signal", label: "极弱信号", description: "信号远弱于噪声，应拒绝结论。" },
  { id: "few-cycles", label: "少周期低频", description: "观测内仅约 2 个周期。" },
  { id: "exact-nyquist", label: "恰 Nyquist", description: "频率恰为 fs/2，采样退化。" },
  { id: "mains-hum", label: "工频干扰", description: "信号叠加 50 Hz 工频干扰。" },
  { id: "invalid-nonincreasing", label: "边界：时间重复", description: "时间戳非递增，应被拒绝。" },
  { id: "invalid-nan", label: "边界：无效值", description: "含 NaN/Infinity，应被拒绝。" },
  { id: "invalid-toolong", label: "边界：样本超限", description: "超过 50 万样本，应被拒绝。" },
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
    case "harmonics": {
      const f0 = range(random, 20, 0.12 * fs);
      return { ...base, condition, noiseSigma: amplitude * 0.01, components: [{ frequency: f0, amplitude, phase: range(random, 0, TAU) }, { frequency: 2 * f0, amplitude: amplitude * 0.3, phase: range(random, 0, TAU) }, { frequency: 3 * f0, amplitude: amplitude * 0.15, phase: range(random, 0, TAU) }] };
    }
    case "spike":
      return { ...base, condition, spikes: { count: pick(random, [3, 5, 8]), amplitude: amplitude * range(random, 3, 6) } };
    case "dropout":
      return { ...base, condition, dropout: { startFraction: 0.4, endFraction: 0.6 } };
    case "close-tones": {
      const f1 = range(random, 50, 0.2 * fs);
      return { ...base, condition, components: [{ frequency: f1, amplitude, phase: range(random, 0, TAU) }, { frequency: f1 + range(random, 2, 8), amplitude: amplitude * 0.9, phase: range(random, 0, TAU) }] };
    }
    case "over-modulation":
      return { ...base, condition, waveform: "am", carrierFrequency: range(random, 0.1 * fs, 0.3 * fs), carrierAmplitude: amplitude, carrierPhase: range(random, 0, TAU), modulationFrequency: range(random, 2, 8), modulationIndex: range(random, 1.2, 1.8), modulationPhase: range(random, 0, TAU), noiseSigma: 0.02 };
    case "weak-signal":
      return { ...base, condition, noiseSigma: 1.0, components: [{ frequency: toneFrequency, amplitude: 0.05, phase: range(random, 0, TAU) }] };
    case "few-cycles":
      return { ...base, condition, noiseSigma: amplitude * 0.02, components: [{ frequency: (2.2 * fs) / (baseN - 1), amplitude, phase: range(random, 0, TAU) }] };
    case "exact-nyquist":
      return { ...base, condition, noiseSigma: 0, components: [{ frequency: nyquist, amplitude, phase: 0 }] };
    case "mains-hum":
      return { ...base, condition, components: [{ frequency: range(random, 80, 0.3 * fs), amplitude, phase: range(random, 0, TAU) }, { frequency: 50, amplitude: amplitude * 0.5, phase: range(random, 0, TAU) }] };
    case "invalid-nonincreasing":
      return { ...base, condition, duplicateTime: true };
    case "invalid-nan":
      return { ...base, condition, nanCount: pick(random, [3, 5]) };
    case "invalid-toolong":
      return { ...base, condition, n: 500001 };
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
  else if (primary && primary.frequency > 0.9 * nyquist && primary.frequency < nyquist) conditions.push(`频率 ${primary.frequency.toFixed(1)} Hz 接近 Nyquist ${nyquist} Hz`);
  if (params.n < 128) conditions.push(`短观测：仅 ${params.n} 样本，分辨率约 ${(params.fs / params.n).toFixed(1)} Hz`);
  if (params.waveform === "noise") conditions.push("纯噪声，无确定性信号");
  if (params.waveform === "chirp") conditions.push("扫频信号，候选库外");
  if (params.spikes) conditions.push(`脉冲干扰：${params.spikes.count} 个尖峰 ±${params.spikes.amplitude.toFixed(2)}`);
  if (params.dropout) conditions.push(`信号掉零：${Math.round(params.dropout.startFraction * 100)}%–${Math.round(params.dropout.endFraction * 100)}% 段缺失`);
  if (params.nanCount) conditions.push(`含 ${params.nanCount} 个 NaN/Infinity 无效值`);
  if (params.duplicateTime) conditions.push("时间戳重复（非递增）");
  if (params.n > 500000) conditions.push(`样本数 ${params.n} 超 50 万上限`);
  if (params.components?.length >= 3) conditions.push("含谐波成分（基波+谐波）");
  if (params.waveform === "am" && params.modulationIndex > 1) conditions.push(`AM 过调制：指数 ${params.modulationIndex.toFixed(2)} > 1`);
  if (primary && Math.abs(primary.frequency - nyquist) < 1e-9) conditions.push("频率恰为 Nyquist，采样退化");
  if (primary && primary.frequency * ((params.n - 1) / params.fs) < 3) conditions.push(`少周期：观测内约 ${(primary.frequency * (params.n - 1) / params.fs).toFixed(1)} 个周期`);
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
    return { verdict: "input-rejected", rejected: true, unknown: null, reliability: null, model: null, healthIssues: [], aliasing: false, frequencyError: null, amplitudeError: null, r2: null, bicGap: null, notes: [`输入被拒绝：${error.message}`, "这是预期的边界保护——数据不满足分析前提（样本数 / 采样均匀性 / 有限值），系统拒绝而非强行拟合。"] };
  }
  const nyquist = params.fs / 2;
  const resolution = params.fs / params.n;
  const duration = (params.n - 1) / params.fs;
  const healthIssues = result.health.checks.filter((check) => check.status !== "pass").map((check) => `${check.label}：${check.detail}`);
  const metrics = result.best?.metrics ?? null;
  const r2 = metrics?.r2 ?? null;
  const rmse = metrics?.rmse ?? null;
  const bicGap = result.reliability?.bicGap ?? null;
  const modelFrequency = result.best?.parameters.find((parameter) => parameter.id === "frequency_1")?.value ?? null;
  const modelAmplitude = result.best?.parameters.find((parameter) => parameter.id === "amplitude_1")?.value ?? null;
  const notes = [];
  let aliasing = false;
  let frequencyError = null;
  let amplitudeError = null;

  if (groundTruth.frequency != null && groundTruth.frequency > nyquist && modelFrequency != null) {
    const alias = aliasFrequency(groundTruth.frequency, params.fs);
    if (Math.abs(modelFrequency - alias) < Math.max(1, resolution)) {
      aliasing = true;
      notes.push(`混叠：真实频率 ${groundTruth.frequency.toFixed(1)} Hz 超过 Nyquist ${nyquist} Hz，采样后折叠为假频 ${modelFrequency.toFixed(1)} Hz（理论混叠 ${alias.toFixed(1)} Hz）。`);
      notes.push(`系统把这个假频当作真实信号（R²=${r2?.toFixed(3)}）并可能判可靠——从采样数据本身无法区分真频与假频，这是采样定理的固有局限。`);
      notes.push(`避免方法：采样率提高到 > ${(2 * groundTruth.frequency).toFixed(0)} Hz，或采集前加抗混叠滤波。`);
    }
  }
  if (!aliasing && groundTruth.frequency != null && modelFrequency != null && result.recommendedId === "single_tone") {
    frequencyError = Math.abs(modelFrequency - groundTruth.frequency);
  }
  if (groundTruth.amplitude != null && modelAmplitude != null && (result.recommendedId === "single_tone" || result.recommendedId === "iq_single")) {
    amplitudeError = Math.abs(modelAmplitude - groundTruth.amplitude);
  }

  let verdict;
  if (aliasing) {
    verdict = "aliasing-warning";
  } else if (result.unknown) {
    verdict = "unknown-rejected";
    const prominence = result.reliability.evidence.find((item) => item.id === "spectral_prominence");
    if (prominence && prominence.status !== "pass") {
      notes.push(`拒绝原因：无显著谱峰（${prominence.detail}），数据中没有可辨识的确定性频率成分。`);
    } else if (r2 != null && r2 < 0.5) {
      notes.push(`拒绝原因：最佳候选拟合解释力 R²=${r2.toFixed(3)} 低于 0.5 阈值，候选库无法充分解释数据。`);
    } else {
      notes.push("拒绝原因：证据不足，候选库无法给出可靠结论。");
    }
    if (params.waveform === "noise") notes.push("这是纯噪声——没有信号可拟合，拒绝结论是正确且诚实的行为。");
    else if (params.waveform === "chirp") notes.push(`这是扫频信号（${groundTruth.startFrequency?.toFixed(0)}→${groundTruth.endFrequency?.toFixed(0)} Hz），频率随时间变化，超出定频/调制候选库的表达能力。`);
    else if (params.components?.[0] && params.components[0].amplitude < 0.1) notes.push("信号幅值极小、淹没在噪声中（SNR 极低），提高信噪比后才可能辨识。");
    else notes.push("可尝试延长观测、提高信噪比，或确认信号是否落在候选库内。");
  } else if (result.reliability.level === "unreliable") {
    verdict = "unreliable-defect";
    notes.push(`识别出 ${result.best?.label ?? "模型"}（R²=${r2?.toFixed(3)}），但数据缺陷使参数结论不可信。`);
    notes.push(...healthIssues);
    if (params.clip != null) notes.push(`削顶把幅值 ${groundTruth.amplitude?.toFixed(2)} 限制到 ±${params.clip.toFixed(2)}，顶部削平引入谐波，污染频率/幅值估计。`);
    if (params.quantizeBits) notes.push(`${params.quantizeBits}-bit 量化把连续幅值离散成少数电平，量化误差等效谐波失真。`);
    if (params.driftEnd) notes.push(`基线漂移 0→${params.driftEnd.toFixed(2)} 与信号叠加，常数偏移模型无法吸收，残差含低频结构。`);
    if (params.dropout) notes.push("数据中段掉零造成不连续，破坏频谱与拟合。");
    if (params.noiseSigma && groundTruth.amplitude && params.noiseSigma > groundTruth.amplitude * 0.3) notes.push(`噪声 σ=${params.noiseSigma.toFixed(2)} 相对信号幅值 ${groundTruth.amplitude.toFixed(2)} 偏大，参数不确定度高。`);
  } else if (result.reliability.level === "caution") {
    verdict = "caution-boundary";
    notes.push(`模型 ${result.best?.label ?? ""} 可用但需谨慎（R²=${r2?.toFixed(3)}）。`);
    const nyq = result.health.checks.find((check) => check.id === "nyquist");
    const cyc = result.health.checks.find((check) => check.id === "cycles");
    const res = result.reliability.evidence.find((item) => item.id === "frequency_resolution");
    if (nyq && nyq.status !== "pass" && modelFrequency != null) notes.push(`主频 ${modelFrequency.toFixed(1)} Hz 达 Nyquist ${nyquist} Hz 的 ${((modelFrequency / nyquist) * 100).toFixed(0)}%，采样裕量不足，易受混叠/滤波滚降影响。`);
    if (cyc && cyc.status !== "pass" && modelFrequency != null) notes.push(`观测内仅约 ${(modelFrequency * duration).toFixed(1)} 个周期，频率分辨率受限。`);
    if (res && res.status !== "pass") notes.push(`观测时长 ${duration.toFixed(3)} s 决定分辨率约 ±${resolution.toFixed(1)} Hz（1/T），频率不确定度较大。`);
    notes.push(...healthIssues.filter((issue) => !issue.startsWith("Nyquist") && !issue.startsWith("观测周期")));
  } else {
    verdict = "correct-model";
    notes.push(`可靠识别：${result.best?.label ?? ""}，R²=${r2?.toFixed(4)}、RMSE=${rmse?.toFixed(4)}。`);
    if (frequencyError != null) {
      const tier = frequencyError < resolution * 0.05 ? "极高" : frequencyError < resolution * 0.2 ? "高" : "中等";
      notes.push(`频率估计 ${modelFrequency.toFixed(3)} Hz，真值 ${groundTruth.frequency.toFixed(2)} Hz，误差 ${frequencyError.toFixed(3)} Hz（${tier}精度，观测分辨率 ±${resolution.toFixed(2)} Hz）。`);
    }
    if (amplitudeError != null) notes.push(`幅值估计 ${modelAmplitude.toFixed(3)}，真值 ${groundTruth.amplitude.toFixed(2)}，误差 ${amplitudeError.toFixed(3)}。`);
    if (bicGap != null) notes.push(`模型区分度：最优领先次优 ${bicGap.toFixed(1)} BIC${bicGap >= 10 ? "（区分充分）" : "（<10，区分有限，结论对噪声敏感）"}。`);
    if (result.recommendedId === "am" || result.recommendedId === "fm") {
      const modulationIndex = result.best.parameters.find((parameter) => parameter.id === "modulation_index")?.value;
      const modulationFrequency = result.best.parameters.find((parameter) => parameter.id === "modulation_frequency")?.value;
      if (modulationIndex != null) notes.push(`调制指数 ${modulationIndex.toFixed(3)}、调制频率 ${modulationFrequency?.toFixed(2)} Hz，边带结构支持调制候选。`);
    }
  }

  return { verdict, rejected: false, unknown: result.unknown, reliability: result.reliability.level, model: result.recommendedId, modelFrequency, modelAmplitude, healthIssues, aliasing, frequencyError, amplitudeError, r2, bicGap, notes };
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

export function buildExperimentPayload(experiment) {
  const { params, groundTruth, conditions, result, outcome } = experiment;
  const evidence = (result?.reliability?.evidence ?? []).map((item) => ({ label: item.label, value: item.value, detail: item.detail, status: item.status }));
  return {
    scenarioId: `experiment-${params.condition ?? "custom"}`,
    title: `随机实验：${params.condition ?? "自定义条件"}`,
    category: "experiment",
    concept: `在采样率 ${params.fs} Hz、${params.n} 样本下生成 ${params.waveform ?? "tones"} 信号并分析，演示该采集条件会得到什么结果。`,
    points: [
      ...conditions,
      `分析结论：${outcome.verdict}（模型 ${outcome.model ?? "unknown"}，可信度 ${outcome.reliability ?? "—"}）。`,
      ...outcome.notes,
    ],
    evidence,
    recommendedModel: outcome.model ?? null,
    unknown: outcome.unknown ?? null,
    reliabilityLevel: outcome.reliability ?? null,
    healthStatus: result?.health?.status ?? null,
    diagnosis: null,
    groundTruth,
  };
}