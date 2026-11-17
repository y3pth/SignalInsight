import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
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

function uniformTime(n, fs) {
  return Array.from({ length: n }, (_, index) => index / fs);
}

const fixtures = [
  {
    file: "single-tone-noisy.csv",
    description: "单频正弦 + 高斯噪声，干净基线",
    kind: "real",
    seed: 42,
    fs: 1024,
    n: 2048,
    delimiter: ",",
    headers: ["time", "signal"],
    groundTruth: { frequency: 93.7, amplitude: 2, phase: 0.4, offset: 0.1, noiseSigma: 0.02 },
    columns: (time, random) => [
      time.map((t) => 0.1 + 2 * Math.sin(TAU * 93.7 * t + 0.4) + 0.02 * gaussian(random)),
    ],
  },
  {
    file: "dual-tone-noisy.csv",
    description: "双频叠加 + 高斯噪声",
    kind: "real",
    seed: 43,
    fs: 1024,
    n: 2048,
    delimiter: ",",
    headers: ["time", "signal"],
    groundTruth: {
      components: [
        { frequency: 80.5, amplitude: 1.2, phase: 0.1 },
        { frequency: 173.2, amplitude: 0.7, phase: -0.5 },
      ],
      offset: 0.1,
      noiseSigma: 0.02,
    },
    columns: (time, random) => [
      time.map(
        (t) =>
          0.1 +
          1.2 * Math.sin(TAU * 80.5 * t + 0.1) +
          0.7 * Math.sin(TAU * 173.2 * t - 0.5) +
          0.02 * gaussian(random),
      ),
    ],
  },
  {
    file: "am-noisy.csv",
    description: "AM 调制 + 高斯噪声（载波 120 Hz，调制 5 Hz，指数 0.6）",
    kind: "real",
    seed: 99,
    fs: 1024,
    n: 4096,
    delimiter: ",",
    headers: ["time", "signal"],
    groundTruth: {
      carrierFrequency: 120,
      carrierAmplitude: 2,
      modulationFrequency: 5,
      modulationIndex: 0.6,
      offset: 0.1,
      noiseSigma: 0.02,
    },
    columns: (time, random) => [
      time.map(
        (t) =>
          0.1 +
          2 * (1 + 0.6 * Math.cos(TAU * 5 * t + 0.3)) * Math.cos(TAU * 120 * t + 0.2) +
          0.02 * gaussian(random),
      ),
    ],
  },
  {
    file: "fm-noisy.csv",
    description: "FM 调制 + 高斯噪声（载波 150 Hz，调制 4 Hz，β=2）",
    kind: "real",
    seed: 123,
    fs: 1024,
    n: 4096,
    delimiter: ",",
    headers: ["time", "signal"],
    groundTruth: {
      carrierFrequency: 150,
      carrierAmplitude: 2,
      modulationFrequency: 4,
      modulationIndex: 2,
      offset: 0.1,
      noiseSigma: 0.02,
    },
    columns: (time, random) => [
      time.map(
        (t) =>
          0.1 +
          2 * Math.cos(TAU * 150 * t + 2 * Math.sin(TAU * 4 * t + 0.4) + 0.1) +
          0.02 * gaussian(random),
      ),
    ],
  },
  {
    file: "clipped-tone.csv",
    description: "削顶/饱和：50 Hz 幅值 2 被限制在 ±1",
    kind: "real",
    seed: 1,
    fs: 1000,
    n: 1024,
    delimiter: ",",
    headers: ["time", "signal"],
    groundTruth: { frequency: 50, amplitude: 2, clipLevel: 1 },
    columns: (time) => [
      time.map((t) => Math.max(-1, Math.min(1, 2 * Math.sin(TAU * 50 * t)))),
    ],
  },
  {
    file: "drift-tone.csv",
    description: "直流漂移：50 Hz 叠加 0→2.5 线性漂移；分号分隔 + BOM",
    kind: "real",
    seed: 2,
    fs: 1000,
    n: 2048,
    delimiter: ";",
    bom: true,
    headers: ["time", "signal"],
    groundTruth: { frequency: 50, amplitude: 1, driftStart: 0, driftEnd: 2.5 },
    columns: (time) => {
      const duration = time[time.length - 1];
      return [time.map((t) => Math.sin(TAU * 50 * t) + 2.5 * (t / duration))];
    },
  },
  {
    file: "quantized-tone.csv",
    description: "ADC 量化：20 Hz 幅值 2 经 4-bit 量化（量程 ±2.5），触发阶梯/量化体检",
    kind: "real",
    seed: 3,
    fs: 1000,
    n: 1024,
    delimiter: ",",
    headers: ["time", "signal"],
    groundTruth: { frequency: 20, amplitude: 2, adcBits: 4, adcRange: 2.5 },
    columns: (time) => {
      const step = 5 / 16;
      return [time.map((t) => Math.round((2 * Math.sin(TAU * 20 * t)) / step) * step)];
    },
  },
  {
    file: "jittered-tone.csv",
    description: "采样抖动 ±2%（容差 5% 内）：50 Hz，值按真实抖动时刻计算",
    kind: "real",
    seed: 4,
    fs: 1000,
    n: 2048,
    delimiter: ",",
    headers: ["time", "signal"],
    groundTruth: { frequency: 50, amplitude: 2, phase: 0.2, offset: 0.1, jitterPercent: 2, noiseSigma: 0.01 },
    time: (n, fs, random) =>
      Array.from({ length: n }, (_, index) => index / fs + (random() - 0.5) * 0.04 / fs),
    columns: (time, random) => [
      time.map((t) => 0.1 + 2 * Math.sin(TAU * 50 * t + 0.2) + 0.01 * gaussian(random)),
    ],
  },
  {
    file: "iq-single.csv",
    description: "IQ 单分量复指数：120 Hz / 幅值 2 / 相位 0.3，I/Q 各带噪声与偏置",
    kind: "iq",
    seed: 5,
    fs: 1024,
    n: 4096,
    delimiter: ",",
    headers: ["time", "I", "Q"],
    groundTruth: { frequency: 120, amplitude: 2, phase: 0.3, iOffset: 0.1, qOffset: 0.05, noiseSigma: 0.01 },
    columns: (time, random) => [
      time.map((t) => 0.1 + 2 * Math.cos(TAU * 120 * t + 0.3) + 0.01 * gaussian(random)),
      time.map((t) => 0.05 + 2 * Math.sin(TAU * 120 * t + 0.3) + 0.01 * gaussian(random)),
    ],
  },
  {
    file: "multi-channel.csv",
    description: "多通道：time + 3 个独立单频通道（50/120/200 Hz）",
    kind: "multi",
    seed: 6,
    fs: 1024,
    n: 2048,
    delimiter: ",",
    headers: ["time", "ch1", "ch2", "ch3"],
    groundTruth: {
      channels: [
        { header: "ch1", frequency: 50, amplitude: 1.5, phase: 0.1 },
        { header: "ch2", frequency: 120, amplitude: 1.0, phase: -0.3 },
        { header: "ch3", frequency: 200, amplitude: 0.8, phase: 0.5 },
      ],
      noiseSigma: 0.02,
    },
    columns: (time, random) => [
      time.map((t) => 1.5 * Math.sin(TAU * 50 * t + 0.1) + 0.02 * gaussian(random)),
      time.map((t) => 1.0 * Math.sin(TAU * 120 * t - 0.3) + 0.02 * gaussian(random)),
      time.map((t) => 0.8 * Math.sin(TAU * 200 * t + 0.5) + 0.02 * gaussian(random)),
    ],
  },
  {
    file: "out-of-library-chirp.csv",
    description: "库外信号：线性 chirp 20→200 Hz，候选库无法表达",
    kind: "real",
    seed: 8,
    fs: 1024,
    n: 2048,
    delimiter: ",",
    headers: ["time", "signal"],
    groundTruth: { startFrequency: 20, endFrequency: 200, amplitude: 1.5, noiseSigma: 0.02 },
    columns: (time, random) => {
      const duration = time[time.length - 1];
      const rate = (200 - 20) / (2 * duration);
      return [time.map((t) => 1.5 * Math.sin(TAU * (20 * t + rate * t * t)) + 0.02 * gaussian(random))];
    },
  },
  {
    file: "noise-only.csv",
    description: "纯高斯噪声：应拒绝给出模型结论（unknown）",
    kind: "real",
    seed: 7,
    fs: 1024,
    n: 2048,
    delimiter: ",",
    headers: ["time", "signal"],
    groundTruth: { noiseSigma: 1 },
    columns: (time, random) => [time.map(() => gaussian(random))],
  },
];

const expectations = {
  "single-tone-noisy.csv": {
    unknown: false, model: "single_tone", reliability: "reliable", health: "ok", minR2: 0.999,
    params: [
      { id: "frequency_1", value: 93.7, tolerance: 0.05 },
      { id: "amplitude_1", value: 2, tolerance: 0.02 },
      { id: "phase_1", value: 0.4, tolerance: 0.05 },
    ],
  },
  "dual-tone-noisy.csv": {
    unknown: false, model: "multi_tone_2", reliability: "reliable", health: "ok", minR2: 0.999,
    params: [
      { id: "frequency_1", value: 80.5, tolerance: 0.1 },
      { id: "frequency_2", value: 173.2, tolerance: 0.1 },
      { id: "amplitude_1", value: 1.2, tolerance: 0.03 },
      { id: "amplitude_2", value: 0.7, tolerance: 0.03 },
    ],
  },
  "am-noisy.csv": {
    unknown: false, model: "am", reliability: "reliable", health: "ok", minR2: 0.99,
    params: [
      { id: "frequency_1", value: 120, tolerance: 0.2 },
      { id: "modulation_frequency", value: 5, tolerance: 0.2 },
      { id: "modulation_index", value: 0.6, tolerance: 0.08 },
    ],
  },
  "fm-noisy.csv": {
    unknown: false, model: "fm", reliability: "reliable", health: "ok", minR2: 0.99,
    params: [
      { id: "frequency_1", value: 150, tolerance: 0.2 },
      { id: "modulation_frequency", value: 4, tolerance: 0.2 },
      { id: "modulation_index", value: 2, tolerance: 0.15 },
    ],
  },
  "clipped-tone.csv": {
    unknown: false, reliability: "unreliable", health: "fail",
    healthChecks: { clipping: "fail" },
  },
  "drift-tone.csv": {
    unknown: true, reliability: "insufficient_evidence", health: "fail",
    healthChecks: { drift: "fail" },
  },
  "quantized-tone.csv": {
    unknown: false, reliability: "unreliable", health: "fail",
    healthChecks: { quantization: "fail" },
  },
  "jittered-tone.csv": {
    unknown: false, model: "single_tone", reliability: "reliable", health: "ok", minR2: 0.999,
    params: [
      { id: "frequency_1", value: 50, tolerance: 0.1 },
      { id: "amplitude_1", value: 2, tolerance: 0.03 },
    ],
  },
  "iq-single.csv": {
    unknown: false, model: "iq_single", reliability: "reliable", health: "ok",
    params: [
      { id: "frequency_1", value: 120, tolerance: 0.1 },
      { id: "amplitude_1", value: 2, tolerance: 0.05 },
      { id: "phase_1", value: 0.3, tolerance: 0.05 },
    ],
  },
  "multi-channel.csv": {
    channels: [
      { header: "ch1", model: "single_tone", health: "ok", params: [{ id: "frequency_1", value: 50, tolerance: 0.1 }] },
      { header: "ch2", model: "single_tone", health: "ok", params: [{ id: "frequency_1", value: 120, tolerance: 0.1 }] },
      { header: "ch3", model: "single_tone", health: "ok", params: [{ id: "frequency_1", value: 200, tolerance: 0.1 }] },
    ],
  },
  "out-of-library-chirp.csv": {
    unknown: true, model: null, reliability: "insufficient_evidence", health: "ok",
  },
  "noise-only.csv": {
    unknown: true, model: null, reliability: "insufficient_evidence", health: "ok",
  },
};

const manifestFixtures = [];
for (const fixture of fixtures) {
  const random = seededNoise(fixture.seed);
  const time = fixture.time
    ? fixture.time(fixture.n, fixture.fs, random)
    : uniformTime(fixture.n, fixture.fs);
  const columns = fixture.columns(time, random);
  const lines = [fixture.headers.join(fixture.delimiter)];
  for (let index = 0; index < time.length; index += 1) {
    const cells = [time[index].toFixed(9), ...columns.map((column) => column[index].toFixed(6))];
    lines.push(cells.join(fixture.delimiter));
  }
  const text = (fixture.bom ? "\uFEFF" : "") + lines.join("\n") + "\n";
  writeFileSync(path.join(directory, fixture.file), text);
  manifestFixtures.push({
    file: fixture.file,
    description: fixture.description,
    simulated: true,
    seed: fixture.seed,
    sampleRate: fixture.fs,
    sampleCount: fixture.n,
    delimiter: fixture.delimiter,
    bom: Boolean(fixture.bom),
    timeHeader: fixture.headers[0],
    kind: fixture.kind,
    groundTruth: fixture.groundTruth,
    expect: expectations[fixture.file],
  });
}

const manifest = {
  note: "全部 fixture 均为仿真数据（明确标注），由 generate.mjs 确定性生成，不是真实测量数据。",
  regenerate: "node site/test/fixtures/generate.mjs",
  fixtures: manifestFixtures,
};
writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Generated ${fixtures.length} fixtures + manifest.json`);