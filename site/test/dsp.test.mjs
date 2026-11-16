import assert from "node:assert/strict";
import { analyzeSignal } from "../dist/dsp.js";

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

console.log("DSP tests passed", {
  singleFrequency: frequency,
  dualFrequencies: dualResult.best.frequencies,
  noiseReliability: noiseResult.reliability.level,
});
