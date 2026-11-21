import { analyzeSignal, analyzeIqSignal } from "./dsp.js?v=12";

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

function synthesizeSignal(params) {
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

const SCENARIOS = [
  {
    id: "clean-single",
    title: "干净单频信号",
    category: "clean",
    difficulty: 1,
    summary: "一段含轻微噪声的单频正弦。学习如何从频谱识别单一频率成分，并理解为什么不需要更复杂的模型。",
    signal: { kind: "real", waveform: "tones", fs: 1024, n: 2048, seed: 42, components: [{ frequency: 93.7, amplitude: 2, phase: 0.4 }], offset: 0.1, noiseSigma: 0.02 },
    groundTruth: { frequency: 93.7, amplitude: 2, phase: 0.4 },
    expected: { unknown: false, model: "single_tone", reliability: "reliable", health: "ok" },
    principle: {
      concept: "单频正弦的频谱表现为单一显著谱峰；给定频率后用最小二乘估计幅值/相位，频率再局部精化。",
      evidenceIds: ["spectral_prominence", "fit_quality", "residual_whiteness", "frequency_resolution"],
      points: [
        "主谱峰显著度远高于中位数基线，说明存在确定的频率成分，而非噪声起伏。",
        "单频模型 R² 接近 1、残差接近测量噪声，说明模型已充分解释数据。",
        "BIC 对参数复杂度施加惩罚；双频/三频若无显著改善就不应升级，避免过拟合。",
        "频率不确定度受观测时长限制（约 1/T 分辨率），不是严格统计置信区间。",
      ],
    },
    diagnosis: null,
    questions: ["为什么不用双频模型拟合这段数据？BIC 在其中起什么作用？", "如果观测时长减半，频率分辨率和估计稳定性会怎样变化？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "dual-tone",
    title: "双频叠加信号",
    category: "clean",
    difficulty: 2,
    summary: "两个频率叠加的信号。学习频谱如何分辨多个成分，以及模型阶梯何时升级到双频。",
    signal: { kind: "real", waveform: "tones", fs: 1024, n: 2048, seed: 43, components: [{ frequency: 80.5, amplitude: 1.2, phase: 0.1 }, { frequency: 173.2, amplitude: 0.7, phase: -0.5 }], offset: 0.1, noiseSigma: 0.02 },
    groundTruth: { components: [{ frequency: 80.5, amplitude: 1.2 }, { frequency: 173.2, amplitude: 0.7 }] },
    expected: { unknown: false, model: "multi_tone_2", reliability: "reliable", health: "ok" },
    principle: {
      concept: "多个正弦叠加在频谱上表现为多个分离谱峰；变量投影拟合可同时估计各成分的频率/幅值/相位。",
      evidenceIds: ["spectral_prominence", "fit_quality", "residual_whiteness"],
      points: [
        "频谱出现两个显著峰，提示至少两个频率成分。",
        "单频拟合残差仍含明显周期结构（残差 ACF/残余谱偏高），说明欠拟合。",
        "升级到双频后 BIC 显著改善、RSS 明显下降，阶梯选择才接受双频。",
        "两峰间隔需大于谱分辨能力才能被稳定区分。",
      ],
    },
    diagnosis: null,
    questions: ["单频模型拟合双频数据时，残差会留下什么痕迹？", "BIC 改善多少才足以支持升级到双频？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "am-tone",
    title: "调幅（AM）信号",
    category: "modulation",
    difficulty: 3,
    summary: "载波幅值随调制信号变化的 AM 信号。学习从包络识别调制，并理解 AM 候选为何优于纯音调。",
    signal: { kind: "real", waveform: "am", fs: 1024, n: 4096, seed: 99, carrierFrequency: 120, carrierAmplitude: 2, carrierPhase: 0.2, modulationFrequency: 5, modulationIndex: 0.6, modulationPhase: 0.3, offset: 0.1, noiseSigma: 0.02 },
    groundTruth: { carrierFrequency: 120, modulationFrequency: 5, modulationIndex: 0.6 },
    expected: { unknown: false, model: "am", reliability: "reliable", health: "ok" },
    principle: {
      concept: "AM 用解析信号提取包络，包络的正弦拟合给出调制频率与调制指数；频谱上表现为载波加两侧边带。",
      evidenceIds: ["modulation_structure", "spectral_prominence", "fit_quality"],
      points: [
        "包络呈周期性起伏，调制频率约 5 Hz，调制指数约 0.6。",
        "频谱在载波 120 Hz 两侧出现对称边带（fc±fm），是 AM 的结构证据。",
        "AM 候选需通过调制显著度门控，且 BIC/RSS 优于最佳音调模型才被选中。",
        "AM 结论是拟合候选，不等同于物理调制机制的唯一证明。",
      ],
    },
    diagnosis: null,
    questions: ["AM 信号为什么用纯多频模型拟合不够 parsimonious？", "调制指数过大（>1）会发生什么？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "fm-tone",
    title: "调频（FM）信号",
    category: "modulation",
    difficulty: 3,
    summary: "瞬时频率随调制信号变化的 FM 信号。学习从瞬时频率识别调制，并理解频偏与调制指数 β。",
    signal: { kind: "real", waveform: "fm", fs: 1024, n: 4096, seed: 123, carrierFrequency: 150, carrierAmplitude: 2, carrierPhase: 0.1, modulationFrequency: 4, modulationIndex: 2, modulationPhase: 0.4, offset: 0.1, noiseSigma: 0.02 },
    groundTruth: { carrierFrequency: 150, modulationFrequency: 4, modulationIndex: 2 },
    expected: { unknown: false, model: "fm", reliability: "reliable", health: "ok" },
    principle: {
      concept: "FM 用解析信号提取瞬时频率，其正弦拟合给出载频/频偏/调制相位；β=频偏/调制频率，边带数目随 β 增多。",
      evidenceIds: ["modulation_structure", "spectral_prominence", "fit_quality"],
      points: [
        "瞬时频率围绕载频 150 Hz 周期性摆动，调制频率约 4 Hz。",
        "调制指数 β≈2，频谱出现多对边带（比 AM 更宽）。",
        "FM 候选经瞬时频率显著度与 BIC/RSS 门控后优于音调模型。",
        "β 越大占用带宽越宽，这是 FM 的带宽代价。",
      ],
    },
    diagnosis: null,
    questions: ["FM 与 AM 在频谱结构上有何区别？", "β 如何影响边带数量与带宽？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "clipped-tone",
    title: "削顶失真信号",
    category: "defect",
    difficulty: 2,
    summary: "幅值超出量程被削顶的正弦。学习先做数据体检、识别失真，并理解为什么高 R² 也可能不可信。",
    signal: { kind: "real", waveform: "tones", fs: 1000, n: 1024, seed: 1, components: [{ frequency: 50, amplitude: 2, phase: 0 }], offset: 0, noiseSigma: 0, clip: 1 },
    groundTruth: { frequency: 50, amplitude: 2, clipLevel: 1 },
    expected: { unknown: false, reliability: "unreliable", health: "fail", healthChecks: { clipping: "fail" } },
    principle: {
      concept: "削顶把正弦顶部削平，等效引入高次谐波；数据质量问题必须先于模型结论被识别。",
      evidenceIds: ["data_health", "spectral_prominence", "residual_structure"],
      points: [
        "连续多个样本贴近极值，是削顶/饱和的直接证据（体检 clipping 判 fail）。",
        "削顶产生高次谐波，频谱出现额外峰，可能误导模型竞争选出多频模型。",
        "即使拟合 R² 很高，数据本身失真会使参数结论不可信（可信度判 unreliable）。",
        "正确做法是先修复量程/增益再采集，而不是对失真数据强行拟合。",
      ],
    },
    diagnosis: {
      issues: ["削顶/饱和：信号幅值 2 超出量程 ±1，顶部被削平"],
      causes: ["放大器增益过高，或 ADC 量程不足"],
      improvements: ["降低增益或扩大量程，使信号峰值不饱和", "重新采集后确认体检 clipping 通过，再进行模型分析"],
    },
    questions: ["削顶为什么会让模型竞争倾向于选出多频模型？", "R² 很高为什么结论仍然不可信？这说明了什么分析原则？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "drift-tone",
    title: "直流漂移信号",
    category: "defect",
    difficulty: 2,
    summary: "基线随时间缓慢漂移的正弦。学习识别漂移、理解它如何污染拟合，以及为何可能拒绝给出结论。",
    signal: { kind: "real", waveform: "drift", fs: 1000, n: 2048, seed: 2, components: [{ frequency: 50, amplitude: 1, phase: 0 }], driftEnd: 2.5, offset: 0, noiseSigma: 0 },
    groundTruth: { frequency: 50, amplitude: 1, driftStart: 0, driftEnd: 2.5 },
    expected: { unknown: true, reliability: "insufficient_evidence", health: "fail", healthChecks: { drift: "fail" } },
    principle: {
      concept: "直流漂移使首尾基线不一致；常数偏移模型无法吸收斜坡漂移，残差含低频结构，拟合解释力下降。",
      evidenceIds: ["data_health", "fit_quality", "residual_structure"],
      points: [
        "首尾均值差相对信号 RMS 很大，体检 drift 判 fail。",
        "漂移能量与信号能量相当，单频模型 R² 跌到约 0.5 以下。",
        "证据不足时系统输出 unknown，拒绝强行给参数结论。",
        "应先去除漂移（高通/基线校正）再分析，而非接受低质量拟合。",
      ],
    },
    diagnosis: {
      issues: ["直流漂移：基线从 0 漂移到 2.5，与信号幅值相当"],
      causes: ["传感器温漂、放大器直流偏置不稳定或接地问题"],
      improvements: ["采集前稳定温度/偏置", "预处理去趋势或高通滤波后再分析"],
    },
    questions: ["为什么漂移会让 R² 大幅下降？", "系统为什么选择 unknown 而不是给出一个拟合参数？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "quantized-tone",
    title: "粗量化信号",
    category: "defect",
    difficulty: 3,
    summary: "低分辨率 ADC 量化的正弦。学习识别阶梯/量化，理解量化噪声如何引入谐波并降低可信度。",
    signal: { kind: "real", waveform: "tones", fs: 1000, n: 1024, seed: 3, components: [{ frequency: 20, amplitude: 2, phase: 0 }], offset: 0, noiseSigma: 0, quantizeBits: 4, quantizeRange: 2.5 },
    groundTruth: { frequency: 20, amplitude: 2, adcBits: 4, adcRange: 2.5 },
    expected: { unknown: false, reliability: "unreliable", health: "fail", healthChecks: { quantization: "fail" } },
    principle: {
      concept: "粗量化把连续幅值离散成少量电平，相邻样本大量相同（阶梯）；量化误差等效谐波失真。",
      evidenceIds: ["data_health", "spectral_prominence", "residual_structure"],
      points: [
        "大比例相邻样本完全相同，体检 quantization 判 fail。",
        "量化引入高次谐波，频谱出现额外峰，可能诱导多频模型。",
        "即使 R² 高，量化失真使结论不可信（unreliable）。",
        "提高 ADC 分辨率或增大量程利用率可改善。",
      ],
    },
    diagnosis: {
      issues: ["阶梯/量化：4-bit ADC 使相邻样本大量相同"],
      causes: ["ADC 分辨率过低，或信号幅值相对量程过小"],
      improvements: ["使用更高分辨率 ADC", "调整增益使信号充分利用量程"],
    },
    questions: ["量化为什么会产生谐波？", "提高 ADC 位数如何改善分析可信度？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "jittered-tone",
    title: "采样抖动信号",
    category: "clean",
    difficulty: 2,
    summary: "采样时刻有 ±2% 抖动的正弦。学习采样均匀性容差，理解小幅抖动为何仍可可靠分析。",
    signal: { kind: "real", waveform: "tones", fs: 1000, n: 2048, seed: 4, components: [{ frequency: 50, amplitude: 2, phase: 0.2 }], offset: 0.1, noiseSigma: 0.01, jitterPercent: 2 },
    groundTruth: { frequency: 50, amplitude: 2, jitterPercent: 2 },
    expected: { unknown: false, model: "single_tone", reliability: "reliable", health: "ok" },
    principle: {
      concept: "分析要求近似均匀采样（抖动 ≤5%）。小幅抖动在容差内，频率估计仍稳定。",
      evidenceIds: ["fit_quality", "frequency_resolution", "spectral_prominence"],
      points: [
        "采样抖动 ±2% 低于 5% 容差， validateSignal 接受。",
        "频率估计仍接近真值 50 Hz，R² 高，可信度 reliable。",
        "抖动过大（>5%）会被拒绝，因为频谱泄漏与频率偏差显著。",
        "这体现了分析对采样条件的明确边界。",
      ],
    },
    diagnosis: null,
    questions: ["为什么采样抖动需要限制在 5% 以内？", "抖动超限会对频谱造成什么影响？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "chirp",
    title: "库外信号：线性 chirp",
    category: "out-of-library",
    difficulty: 3,
    summary: "频率随时间线性扫过的 chirp。学习识别候选库之外的信号，理解系统为何拒绝给出模型结论。",
    signal: { kind: "real", waveform: "chirp", fs: 1024, n: 2048, seed: 8, startFrequency: 20, endFrequency: 200, amplitude: 1.5, offset: 0, noiseSigma: 0.02 },
    groundTruth: { startFrequency: 20, endFrequency: 200, amplitude: 1.5 },
    expected: { unknown: true, reliability: "insufficient_evidence", health: "ok" },
    principle: {
      concept: "chirp 频率随时间变化，候选库（定频正弦/AM/FM）无法表达；任何定频拟合 R² 都极低。",
      evidenceIds: ["fit_quality", "spectral_prominence", "residual_structure"],
      points: [
        "频谱能量分散在宽频带，无单一稳定主峰。",
        "最佳定频候选 R² 接近 0，远低于 0.5 阈值。",
        "系统输出 unknown，承认候选库无法解释，而非强行拟合。",
        "这是诚实边界：识别'库外'比给出错误结论更重要。",
      ],
    },
    diagnosis: {
      issues: ["候选库失配：信号是扫频 chirp，库内无对应模型"],
      causes: ["信号频率随时间线性变化，超出定频/调制候选表达能力"],
      improvements: ["如需分析 chirp，需扩展时频模型库（属另立阶段）", "或截取近似定频的短段分别分析"],
    },
    questions: ["为什么 chirp 不能用单频模型描述？", "系统拒绝结论体现了什么可信度原则？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "pure-noise",
    title: "库外信号：纯噪声",
    category: "out-of-library",
    difficulty: 1,
    summary: "纯高斯噪声。学习识别'无信号'，理解无显著谱峰时系统如何拒绝给出结论。",
    signal: { kind: "real", waveform: "noise", fs: 1024, n: 2048, seed: 7, noiseSigma: 1 },
    groundTruth: { noiseSigma: 1 },
    expected: { unknown: true, reliability: "insufficient_evidence", health: "ok" },
    principle: {
      concept: "纯噪声没有确定性频率成分；谱峰显著度低、最佳候选 R² 极低，系统拒绝给参数结论。",
      evidenceIds: ["spectral_prominence", "fit_quality", "residual_whiteness"],
      points: [
        "频谱无显著主峰（显著度低于阈值）。",
        "任何正弦拟合 R² 接近 0，无法解释数据。",
        "系统输出 unknown / insufficient_evidence。",
        "区分'有信号但难拟合'与'根本无信号'是可信度分析的基础。",
      ],
    },
    diagnosis: {
      issues: ["无确定性信号：观测为纯噪声"],
      causes: ["未接入信号源，或信号完全淹没在噪声中"],
      improvements: ["确认信号源与接线", "提高信噪比（增益/平均/屏蔽）后重采"],
    },
    questions: ["纯噪声的频谱长什么样？", "为什么'拒绝结论'比'给一个拟合'更可信？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "iq-single",
    title: "IQ 复指数信号",
    category: "clean",
    difficulty: 3,
    summary: "用 I/Q 两路表示的复指数信号。学习复信号表示，以及为什么 IQ 能直接给出幅值/相位而不含负频率镜像。",
    signal: { kind: "iq", waveform: "iq", fs: 1024, n: 4096, seed: 5, carrierFrequency: 120, amplitude: 2, phase: 0.3, iOffset: 0.1, qOffset: 0.05, noiseSigma: 0.01 },
    groundTruth: { frequency: 120, amplitude: 2, phase: 0.3 },
    expected: { unknown: false, model: "iq_single", reliability: "reliable", health: "ok" },
    principle: {
      concept: "复指数 z(t)=c+(u+jv)e^{j2πft} 同时拟合 I/Q 两路；复谱无负频率镜像，频率/复幅值/复相位可直接估计。",
      evidenceIds: ["spectral_prominence", "fit_quality", "residual_whiteness", "frequency_resolution"],
      points: [
        "I=A·cos、Q=A·sin 构成旋转复矢量，幅值 A=√(I²+Q²)，相位 atan2(Q,I)。",
        "复谱只在正频率出现单峰，避免实信号的双边镜像。",
        "IQ 单分量模型同时拟合两路，R² 接近 1，频率/幅值/相位准确。",
        "当前 IQ 仅支持单分量复指数；多分量/复数调制属另立阶段。",
      ],
    },
    diagnosis: null,
    questions: ["IQ 表示相比实信号有什么优势？", "为什么复谱没有负频率镜像？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "weak-modulation",
    title: "弱调制（门控拒绝 AM）",
    category: "modulation",
    difficulty: 3,
    summary: "调制指数极小的 AM 信号。学习保守证据门控：调制证据不足时不轻易判为 AM，而按音调模型处理。",
    signal: { kind: "real", waveform: "am", fs: 1000, n: 2048, seed: 11, carrierFrequency: 120, carrierAmplitude: 2, carrierPhase: 0.2, modulationFrequency: 5, modulationIndex: 0.02, modulationPhase: 0.3, offset: 0.1, noiseSigma: 0.02 },
    groundTruth: { carrierFrequency: 120, modulationFrequency: 5, modulationIndex: 0.02 },
    expected: { unknown: false, reliability: "reliable", health: "ok" },
    principle: {
      concept: "AM 候选需通过调制指数/包络显著度门控且优于音调模型；调制指数 0.02 太弱，门控拒绝 AM，边带被当作多频音调。",
      evidenceIds: ["spectral_prominence", "fit_quality", "residual_structure"],
      points: [
        "调制指数仅 0.02，包络起伏几乎淹没在噪声中，调制证据不足。",
        "系统不把它判为 AM（避免过度声称调制），而用多频音调拟合载波+边带。",
        "这体现保守门控：宁可不用复杂调制模型，也不误判。",
        "增大调制指数或降低噪声后，AM 证据才会通过门控。",
      ],
    },
    diagnosis: null,
    questions: ["为什么弱调制不被判为 AM？", "保守门控如何避免过度声称物理机制？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "low-snr",
    title: "低信噪比信号",
    category: "defect",
    difficulty: 2,
    summary: "噪声很强的单频信号。学习信噪比如何影响可信度：即使识别出模型，参数结论仍可能不可信。",
    signal: { kind: "real", waveform: "tones", fs: 1000, n: 2048, seed: 21, components: [{ frequency: 50, amplitude: 2, phase: 0.2 }], offset: 0.1, noiseSigma: 1.0 },
    groundTruth: { frequency: 50, amplitude: 2, noiseSigma: 1.0 },
    expected: { unknown: false, model: "single_tone", reliability: "unreliable", health: "ok" },
    principle: {
      concept: "强噪声下仍能识别主频，但拟合解释力 R² 下降、参数不确定度增大，可信度判 unreliable。",
      evidenceIds: ["spectral_prominence", "fit_quality", "residual_whiteness"],
      points: [
        "主峰仍可辨识（显著度通过），模型选单频。",
        "噪声功率与信号相当，R² 跌到约 0.66，fit_quality 判 fail。",
        "识别出模型 ≠ 参数可信；可信度综合残差与解释力判 unreliable。",
        "提高信噪比（平均/增益/屏蔽）才能改善参数可信度。",
      ],
    },
    diagnosis: {
      issues: ["信噪比过低：噪声标准差 1.0 与信号幅值 2 相当"],
      causes: ["信号弱或环境噪声强"],
      improvements: ["多次平均提高 SNR", "增大信号增益或改善屏蔽"],
    },
    questions: ["为什么识别出单频模型却仍判 unreliable？", "R² 与可信度是什么关系？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "short-record",
    title: "短观测信号",
    category: "defect",
    difficulty: 2,
    summary: "只有 64 个样本的短记录。学习观测时长如何限制频率分辨率（1/T），以及为何可信度降级。",
    signal: { kind: "real", waveform: "tones", fs: 1000, n: 64, seed: 22, components: [{ frequency: 50, amplitude: 2, phase: 0.2 }], offset: 0.1, noiseSigma: 0.02 },
    groundTruth: { frequency: 50, amplitude: 2, sampleCount: 64 },
    expected: { unknown: false, model: "single_tone", reliability: "caution", health: "warn" },
    principle: {
      concept: "频率分辨率约 1/T（T 为观测时长）。短记录 T 小，分辨率粗，频率不确定度大，可信度降为 caution。",
      evidenceIds: ["frequency_resolution", "data_health", "fit_quality"],
      points: [
        "64 样本 @1000 Hz 仅 0.063 s，约 3 个周期，分辨率约 15.9 Hz。",
        "拟合 R² 仍高，但频率不确定度（1/T）很大，frequency_resolution 判 warn。",
        "系统给 caution 而非 reliable，提醒分辨率不足。",
        "延长观测时长可显著提高频率分辨率与可信度。",
      ],
    },
    diagnosis: {
      issues: ["观测时长不足：仅 64 样本，频率分辨率粗"],
      causes: ["采集时间过短"],
      improvements: ["延长观测时长以覆盖更多周期", "提高采样率不能替代延长时长（分辨率由 T 决定）"],
    },
    questions: ["频率分辨率由什么决定？", "提高采样率能否改善频率分辨率？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "near-nyquist",
    title: "近 Nyquist 信号",
    category: "defect",
    difficulty: 2,
    summary: "频率接近 Nyquist 极限的信号。学习采样定理边界，以及为什么靠近 Nyquist 会触发警告。",
    signal: { kind: "real", waveform: "tones", fs: 1000, n: 2048, seed: 23, components: [{ frequency: 480, amplitude: 2, phase: 0.2 }], offset: 0.1, noiseSigma: 0.02 },
    groundTruth: { frequency: 480, sampleRate: 1000, nyquist: 500 },
    expected: { unknown: false, model: "single_tone", reliability: "caution", health: "warn", healthChecks: { nyquist: "warn" } },
    principle: {
      concept: "采样定理要求信号频率低于 Nyquist（fs/2）。主峰接近 Nyquist 时抗混叠裕量不足，体检 nyquist 判 warn。",
      evidenceIds: ["data_health", "frequency_resolution", "spectral_prominence"],
      points: [
        "fs=1000 Hz，Nyquist=500 Hz；信号 480 Hz 达 Nyquist 的 96%。",
        "靠近 Nyquist 易受混叠与滤波器滚降影响，体检 nyquist 判 warn。",
        "模型仍可拟合，但可信度降为 caution，提醒采样裕量不足。",
        "提高采样率使信号远离 Nyquist 可改善。",
      ],
    },
    diagnosis: {
      issues: ["频率接近 Nyquist：480 Hz 达 500 Hz 的 96%"],
      causes: ["采样率相对信号频率偏低"],
      improvements: ["提高采样率，使信号频率远低于 fs/2", "确认抗混叠滤波器有效"],
    },
    questions: ["Nyquist 频率是什么？", "为什么靠近 Nyquist 需要警告？"],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
];

export function listScenarios() {
  return SCENARIOS.map(({ id, title, category, difficulty, summary }) => ({ id, title, category, difficulty, summary }));
}

export function getScenario(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

export function generateScenarioSignal(id) {
  const scenario = getScenario(id);
  if (!scenario) throw new Error(`未知学习场景：${id}`);
  return synthesizeSignal(scenario.signal);
}

function matchExpected(result, expected) {
  const checks = [];
  if ("unknown" in expected) checks.push(result.unknown === expected.unknown);
  if ("model" in expected) checks.push(result.recommendedId === expected.model);
  if ("reliability" in expected) checks.push(result.reliability.level === expected.reliability);
  if ("health" in expected) checks.push(result.health.status === expected.health);
  for (const [checkId, status] of Object.entries(expected.healthChecks ?? {})) {
    checks.push(result.health.checks.find((check) => check.id === checkId)?.status === status);
  }
  return { ok: checks.every(Boolean), checks };
}

export function analyzeScenario(id) {
  const scenario = getScenario(id);
  if (!scenario) throw new Error(`未知学习场景：${id}`);
  const data = generateScenarioSignal(id);
  const result = data.kind === "iq"
    ? analyzeIqSignal(data.time, data.i, data.q)
    : analyzeSignal(data.time, data.values);
  return { scenario, result, match: matchExpected(result, scenario.expected) };
}

export function buildLearnPayload(scenario, result) {
  const evidenceIds = scenario.principle?.evidenceIds ?? [];
  const evidence = (result?.reliability?.evidence ?? [])
    .filter((item) => evidenceIds.includes(item.id))
    .map((item) => ({ label: item.label, value: item.value, detail: item.detail, status: item.status }));
  return {
    scenarioId: scenario.id,
    title: scenario.title,
    category: scenario.category,
    concept: scenario.principle?.concept ?? "",
    points: scenario.principle?.points ?? [],
    evidence,
    recommendedModel: result?.unknown ? null : (result?.best?.label ?? null),
    unknown: result?.unknown ?? null,
    reliabilityLevel: result?.reliability?.level ?? null,
    healthStatus: result?.health?.status ?? null,
    diagnosis: scenario.diagnosis ?? null,
    groundTruth: scenario.groundTruth ?? null,
  };
}