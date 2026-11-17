import { analyzeSignal, analyzeIqSignal } from "./dsp.js?v=10";

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

const SCENARIOS = [
  {
    id: "clean-single",
    title: "干净单频信号",
    category: "clean",
    difficulty: 1,
    summary: "一段含轻微噪声的单频正弦。学习如何从频谱识别单一频率成分，并理解为什么不需要更复杂的模型。",
    signal: {
      kind: "real", fs: 1024, n: 2048, seed: 42,
      components: [{ frequency: 93.7, amplitude: 2, phase: 0.4 }],
      offset: 0.1, noiseSigma: 0.02,
    },
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
    questions: [
      "为什么不用双频模型拟合这段数据？BIC 在其中起什么作用？",
      "如果观测时长减半，频率分辨率和估计稳定性会怎样变化？",
    ],
    steps: ["observe", "hypothesize", "verify", "conclude"],
  },
  {
    id: "clipped-tone",
    title: "削顶失真信号",
    category: "defect",
    difficulty: 2,
    summary: "幅值超出量程被削顶的正弦。学习先做数据体检、识别失真，并理解为什么高 R² 也可能不可信。",
    signal: {
      kind: "real", fs: 1000, n: 1024, seed: 1,
      components: [{ frequency: 50, amplitude: 2, phase: 0 }],
      offset: 0, noiseSigma: 0, clip: 1,
    },
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
    questions: [
      "削顶为什么会让模型竞争倾向于选出多频模型？",
      "R² 很高为什么结论仍然不可信？这说明了什么分析原则？",
    ],
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
  const signal = scenario.signal;
  const random = seededNoise(signal.seed);
  const time = Array.from({ length: signal.n }, (_, index) => index / signal.fs);
  const values = time.map((t) => {
    let value = signal.offset ?? 0;
    for (const component of signal.components) {
      value += component.amplitude * Math.sin(TAU * component.frequency * t + (component.phase ?? 0));
    }
    if (signal.noiseSigma) value += signal.noiseSigma * gaussian(random);
    if (signal.clip != null) value = Math.max(-signal.clip, Math.min(signal.clip, value));
    return value;
  });
  return { kind: signal.kind, time, values };
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