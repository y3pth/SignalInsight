import assert from "node:assert/strict";
import { analyzeSignal, validateSignal } from "../dist/dsp.js";

function makeSignal(n, fs, fn) {
  const time = Array.from({ length: n }, (_, index) => index / fs);
  return { time, values: time.map(fn) };
}

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

const fs = 1000;
const base = makeSignal(1024, fs, (t) => 0.1 + 2 * Math.sin(2 * Math.PI * 50 * t));
validateSignal(base.time, base.values);
assert.throws(() => validateSignal(base.time.slice(0, 63), base.values.slice(0, 63)), /64/);

const tiny = makeSignal(64, fs, (t) => 0.1 + 2 * Math.sin(2 * Math.PI * 50 * t));
assert.equal(analyzeSignal(tiny.time, tiny.values).sampleCount, 64);

const tooMany = makeSignal(500001, fs, (t) => 0.1 + 2 * Math.sin(2 * Math.PI * 50 * t));
assert.throws(() => analyzeSignal(tooMany.time, tooMany.values), /500,000/);

const jittered = { time: [...base.time], values: [...base.values] };
jittered.time[10] += 0.0002;
assert.throws(() => analyzeSignal(jittered.time, jittered.values), /抖动|5%/);

const nonIncreasing = { time: [...base.time], values: [...base.values] };
nonIncreasing.time[10] = nonIncreasing.time[9];
assert.throws(() => analyzeSignal(nonIncreasing.time, nonIncreasing.values), /严格递增/);

const nonFinite = { time: [...base.time], values: [...base.values] };
nonFinite.values[10] = Number.NaN;
assert.throws(() => analyzeSignal(nonFinite.time, nonFinite.values), /NaN|Infinity/);

const constant = makeSignal(1024, fs, () => 0.1);
assert.equal(analyzeSignal(constant.time, constant.values).unknown, true);

const clipped = makeSignal(1024, fs, (t) =>
  Math.max(-1, Math.min(1, 2 * Math.sin(2 * Math.PI * 50 * t))),
);
assert.notEqual(analyzeSignal(clipped.time, clipped.values).health.status, "ok");

const weakNoise = seededNoise(11);
const weakAm = makeSignal(2048, fs, (t) =>
  0.1 +
  2 * (1 + 0.02 * Math.cos(2 * Math.PI * 5 * t + 0.3)) * Math.cos(2 * Math.PI * 120 * t + 0.2) +
  0.02 * (weakNoise() - 0.5),
);
const weakAmResult = analyzeSignal(weakAm.time, weakAm.values);
assert.notEqual(weakAmResult.recommendedId, "am");
assert.notEqual(weakAmResult.recommendedId, "fm");

const weakFm = makeSignal(2048, fs, (t) =>
  0.1 +
  2 * Math.cos(2 * Math.PI * 150 * t + 0.02 * Math.sin(2 * Math.PI * 4 * t + 0.4) + 0.1) +
  0.02 * (weakNoise() - 0.5),
);
const weakFmResult = analyzeSignal(weakFm.time, weakFm.values);
assert.notEqual(weakFmResult.recommendedId, "fm");
assert.notEqual(weakFmResult.recommendedId, "am");

const dual = makeSignal(4096, fs, (t) =>
  0.1 +
  1.2 * Math.sin(2 * Math.PI * 80.5 * t + 0.1) +
  0.7 * Math.sin(2 * Math.PI * 173.2 * t - 0.5),
);
const dualResult = analyzeSignal(dual.time, dual.values);
assert.equal(dualResult.recommendedId, "multi_tone_2");

const large = makeSignal(500000, fs, (t) => 0.1 + 2 * Math.sin(2 * Math.PI * 50 * t + 0.2));
const started = Date.now();
const largeResult = analyzeSignal(large.time, large.values);
const elapsed = Date.now() - started;
assert.equal(largeResult.recommendedId, "single_tone");
assert.ok(largeResult.best.metrics.r2 > 0.9999, `large R2 ${largeResult.best.metrics.r2}`);
assert.ok(elapsed < 30000, `large analysis ${elapsed}ms`);

console.log("Extreme tests passed", {
  largeSampleCount: largeResult.sampleCount,
  largeElapsedMs: elapsed,
  weakAmModel: weakAmResult.recommendedId,
  weakFmModel: weakFmResult.recommendedId,
  dualModel: dualResult.recommendedId,
});
