import assert from "node:assert/strict";
import {
  analyzeSignal,
  buildAiPayload,
  buildDecision,
  buildExperimentPlan,
  templateExplanation,
} from "../dist/dsp.js";

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

function gaussianPair(random) {
  const u = Math.max(random(), 1e-12);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function buildSignal(components, { fs = 1024, n = 2048, noise = 0.02, offset = 0.1 } = {}) {
  const random = seededNoise(42);
  const time = Array.from({ length: n }, (_, index) => index / fs);
  const values = time.map((t) => {
    let value = offset;
    for (const component of components) {
      value += component.amplitude * Math.sin(2 * Math.PI * component.frequency * t + component.phase);
    }
    return value + noise * gaussianPair(random);
  });
  return { time, values };
}

const single = buildSignal([{ amplitude: 2, frequency: 93.7, phase: 0.4 }]);
const singleResult = analyzeSignal(single.time, single.values);
assert.equal(singleResult.recommendedId, "single_tone");
const frequency = singleResult.best.parameters.find((item) => item.id === "frequency_1").value;
const amplitude = singleResult.best.parameters.find((item) => item.id === "amplitude_1").value;
assert.ok(Math.abs(frequency - 93.7) < 0.05, `single frequency ${frequency}`);
assert.ok(Math.abs(amplitude - 2) < 0.02, `single amplitude ${amplitude}`);
assert.ok(singleResult.best.metrics.r2 > 0.999, `single R2 ${singleResult.best.metrics.r2}`);
assert.notEqual(singleResult.reliability.level, "unreliable");

const singleExplanation = templateExplanation(singleResult);
assert.ok(singleExplanation.summary.length > 0);
assert.ok(singleExplanation.observations.length > 0);
assert.ok(singleExplanation.limitations.length > 0);
const singlePayload = buildAiPayload(singleResult);
assert.equal(singlePayload.unknown, false);
assert.ok(singlePayload.candidates.length > 0);
assert.ok(singlePayload.reliability.limitations.length > 0);
assert.ok(singleResult.candidates.every((candidate) => !("fitted" in candidate) && !("residual" in candidate)));
assert.ok(!("fitted" in singleResult.best) && !("residual" in singleResult.best));
assert.equal(singleResult.series.fitted.length, singleResult.sampleCount);
assert.equal(singleResult.series.residual.length, singleResult.sampleCount);
const singleDecision = buildDecision(singleResult);
assert.ok(singleDecision.title.includes("单频"));
assert.ok(singleDecision.evidenceIds.length > 0);
assert.ok(singleDecision.whatWouldChange.length > 0);
assert.equal(singleResult.health.status, "ok");
assert.ok(buildExperimentPlan(singleResult).items.length > 0);

const dual = buildSignal([
  { amplitude: 1.2, frequency: 80.5, phase: 0.1 },
  { amplitude: 0.7, frequency: 173.2, phase: -0.5 },
]);
const dualResult = analyzeSignal(dual.time, dual.values);
assert.equal(dualResult.recommendedId, "multi_tone_2");
assert.equal(dualResult.best.frequencies.length, 2);
assert.ok(Math.abs(dualResult.best.frequencies[0] - 80.5) < 0.1, `dual f1 ${dualResult.best.frequencies[0]}`);
assert.ok(Math.abs(dualResult.best.frequencies[1] - 173.2) < 0.1, `dual f2 ${dualResult.best.frequencies[1]}`);

const noiseRandom = seededNoise(7);
const noise = { time: single.time, values: single.time.map(() => gaussianPair(noiseRandom)) };
const noiseResult = analyzeSignal(noise.time, noise.values);
assert.equal(noiseResult.unknown, true);
const noisePayload = buildAiPayload(noiseResult);
assert.equal(noisePayload.unknown, true);
assert.equal(noisePayload.recommendedModel, null);
assert.ok(noisePayload.reliability.limitations.length > 0);
assert.equal(buildDecision(noiseResult).title, "暂不推荐模型");

function buildAmSignal() {
  const fs = 1024;
  const n = 4096;
  const random = seededNoise(99);
  const time = Array.from({ length: n }, (_, index) => index / fs);
  const values = time.map((t) =>
    0.1 +
    2 * (1 + 0.6 * Math.cos(2 * Math.PI * 5 * t + 0.3)) * Math.cos(2 * Math.PI * 120 * t + 0.2) +
    0.02 * gaussianPair(random),
  );
  return { time, values };
}

function buildFmSignal() {
  const fs = 1024;
  const n = 4096;
  const random = seededNoise(123);
  const time = Array.from({ length: n }, (_, index) => index / fs);
  const values = time.map((t) =>
    0.1 +
    2 * Math.cos(2 * Math.PI * 150 * t + 2 * Math.sin(2 * Math.PI * 4 * t + 0.4) + 0.1) +
    0.02 * gaussianPair(random),
  );
  return { time, values };
}

const am = buildAmSignal();
const amResult = analyzeSignal(am.time, am.values);
assert.equal(amResult.recommendedId, "am");
assert.ok(amResult.best.metrics.r2 > 0.99, `AM R2 ${amResult.best.metrics.r2}`);
assert.notEqual(amResult.reliability.level, "unreliable");
const amFrequency = amResult.best.parameters.find((item) => item.id === "modulation_frequency").value;
const amIndex = amResult.best.parameters.find((item) => item.id === "modulation_index").value;
assert.ok(Math.abs(amFrequency - 5) < 0.2, `AM modulation frequency ${amFrequency}`);
assert.ok(Math.abs(amIndex - 0.6) < 0.08, `AM modulation index ${amIndex}`);
assert.ok(amResult.reliability.evidence.some((item) => item.id === "modulation_structure"));
assert.ok(buildDecision(amResult).evidenceIds.includes("modulation_structure"));
const amPlan = buildExperimentPlan(amResult);
assert.ok(amPlan.items.some((item) => item.id === "modulation_cycles"));
assert.ok(amPlan.items.some((item) => item.id === "sample_rate"));
assert.equal(amResult.best.modulationView.type, "am");
assert.equal(amResult.best.modulationView.sidebands.length, 3);
assert.ok(amResult.best.modulationView.time.length <= 513);

const fm = buildFmSignal();
const fmResult = analyzeSignal(fm.time, fm.values);
assert.equal(fmResult.recommendedId, "fm");
assert.ok(fmResult.best.metrics.r2 > 0.99, `FM R2 ${fmResult.best.metrics.r2}`);
assert.notEqual(fmResult.reliability.level, "unreliable");
const fmFrequency = fmResult.best.parameters.find((item) => item.id === "modulation_frequency").value;
const fmIndex = fmResult.best.parameters.find((item) => item.id === "modulation_index").value;
assert.ok(Math.abs(fmFrequency - 4) < 0.2, `FM modulation frequency ${fmFrequency}`);
assert.ok(Math.abs(fmIndex - 2) < 0.15, `FM modulation index ${fmIndex}`);
assert.ok(fmResult.reliability.evidence.some((item) => item.id === "modulation_structure"));
assert.ok(buildDecision(fmResult).evidenceIds.includes("modulation_structure"));
assert.equal(fmResult.best.modulationView.type, "fm");
assert.equal(fmResult.best.modulationView.sidebands.length, 5);
assert.ok(fmResult.best.modulationView.time.length <= 513);

console.log("DSP tests passed", {
  singleFrequency: frequency,
  dualFrequencies: dualResult.best.frequencies,
  noiseReliability: noiseResult.reliability.level,
  amFrequency,
  amIndex,
  fmFrequency,
  fmIndex,
});
