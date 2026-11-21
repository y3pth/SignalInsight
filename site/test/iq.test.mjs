import assert from "node:assert/strict";
import { analyzeIqSignal } from "../dist/dsp.js";

const fs = 1024;
const n = 4096;
const frequency = 120;
const amplitude = 2;
const phase = 0.3;
const time = Array.from({ length: n }, (_, index) => index / fs);
const iValues = time.map((t) => 0.1 + amplitude * Math.cos(2 * Math.PI * frequency * t + phase));
const qValues = time.map((t) => 0.05 + amplitude * Math.sin(2 * Math.PI * frequency * t + phase));
const result = analyzeIqSignal(time, iValues, qValues);

assert.equal(result.kind, "iq");
assert.equal(result.recommendedId, "iq_single");
const estimatedFrequency = result.best.parameters.find((item) => item.id === "frequency_1").value;
const estimatedAmplitude = result.best.parameters.find((item) => item.id === "amplitude_1").value;
const estimatedPhase = result.best.parameters.find((item) => item.id === "phase_1").value;
assert.ok(Math.abs(estimatedFrequency - frequency) < 0.1, `IQ frequency ${estimatedFrequency}`);
assert.ok(Math.abs(estimatedAmplitude - amplitude) < 0.05, `IQ amplitude ${estimatedAmplitude}`);
assert.ok(Math.abs(estimatedPhase - phase) < 0.05, `IQ phase ${estimatedPhase}`);
assert.equal(result.series.observed.length, n);
assert.equal(result.iq.q.length, n);

const noiseI = time.map((t, index) => Math.sin(index * 12.9898 + t) * 0.7);
const noiseQ = time.map((t, index) => Math.cos(index * 78.233 + t) * 0.7);
const noiseResult = analyzeIqSignal(time, noiseI, noiseQ);
assert.equal(noiseResult.unknown, true);

console.log("IQ tests passed", {
  estimatedFrequency,
  estimatedAmplitude,
  estimatedPhase,
  reliability: result.reliability.level,
});
