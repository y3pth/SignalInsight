import assert from "node:assert/strict";
import {
  synthesizeSignal,
  randomSignalParams,
  describeConditions,
  generateRandomSignal,
  runExperiment,
  classifyOutcome,
  CONDITION_CATALOG,
} from "../dist/generator.js";

assert.equal(CONDITION_CATALOG.length, 29);
assert.ok(CONDITION_CATALOG.every((item) => item.id && item.label && item.description));

const clean = synthesizeSignal({ kind: "real", waveform: "tones", fs: 1000, n: 512, seed: 1, components: [{ frequency: 50, amplitude: 2, phase: 0 }], noiseSigma: 0.01 });
assert.equal(clean.kind, "real");
assert.equal(clean.time.length, 512);
assert.equal(clean.values.length, 512);

const iq = synthesizeSignal({ kind: "iq", waveform: "iq", fs: 1024, n: 256, seed: 1, carrierFrequency: 120, amplitude: 2, phase: 0.3 });
assert.equal(iq.kind, "iq");
assert.equal(iq.i.length, 256);
assert.equal(iq.q.length, 256);

const paramsA = randomSignalParams({ condition: "clean", seed: 42 });
const paramsB = randomSignalParams({ condition: "clean", seed: 42 });
assert.deepEqual(paramsA, paramsB, "same seed must reproduce params");
assert.equal(paramsA.condition, "clean");

const verdictByCondition = {
  clean: "correct-model",
  clipped: "unreliable-defect",
  quantized: "unreliable-defect",
  jitter: "correct-model",
  aliasing: "aliasing-warning",
  "near-nyquist": "caution-boundary",
  short: "caution-boundary",
  multi: "correct-model",
  iq: "correct-model",
  chirp: "unknown-rejected",
  noise: "unknown-rejected",
  "invalid-short": "input-rejected",
  "invalid-jitter": "input-rejected",
  harmonics: "correct-model",
  spike: "caution-boundary",
  dropout: "unreliable-defect",
  "close-tones": "correct-model",
  "over-modulation": "correct-model",
  "weak-signal": "unknown-rejected",
  "few-cycles": "caution-boundary",
  "exact-nyquist": "unknown-rejected",
  "mains-hum": "correct-model",
  "invalid-nonincreasing": "input-rejected",
  "invalid-nan": "input-rejected",
  "invalid-toolong": "input-rejected",
};
for (const [condition, verdict] of Object.entries(verdictByCondition)) {
  const experiment = runExperiment({ condition, seed: 42 });
  assert.equal(experiment.outcome.verdict, verdict, `${condition} verdict ${experiment.outcome.verdict}`);
  assert.ok(Array.isArray(experiment.outcome.notes) && experiment.outcome.notes.length > 0, `${condition} notes`);
}

const aliasing = runExperiment({ condition: "aliasing", seed: 42 });
assert.equal(aliasing.outcome.aliasing, true);
assert.ok(aliasing.groundTruth.frequency > aliasing.groundTruth.nyquist);
assert.ok(aliasing.outcome.notes.some((note) => note.includes("混叠")));
assert.ok(aliasing.conditions.some((condition) => condition.includes("混叠")));

const clipped = runExperiment({ condition: "clipped", seed: 42 });
assert.ok(clipped.outcome.healthIssues.length > 0);

const short = runExperiment({ condition: "short", seed: 42 });
assert.equal(short.params.n, 64);

const iqExperiment = runExperiment({ condition: "iq", seed: 42 });
assert.equal(iqExperiment.result.kind, "iq");
assert.equal(iqExperiment.result.recommendedId, "iq_single");

const rejected = runExperiment({ condition: "invalid-short", seed: 42 });
assert.equal(rejected.outcome.rejected, true);
assert.equal(rejected.result, null);
assert.ok(rejected.outcome.notes[0].includes("输入被拒绝"));

const fmParams = { kind: "real", waveform: "fm", fs: 1024, n: 4096, seed: 123, carrierFrequency: 150, carrierAmplitude: 2, carrierPhase: 0.1, modulationFrequency: 4, modulationIndex: 2, modulationPhase: 0.4, offset: 0.1, noiseSigma: 0.02, condition: "fm" };
const fm = runExperiment({ params: fmParams });
assert.equal(fm.outcome.verdict, "correct-model");
assert.equal(fm.result.recommendedId, "fm");

const amParams = { kind: "real", waveform: "am", fs: 1024, n: 4096, seed: 99, carrierFrequency: 120, carrierAmplitude: 2, carrierPhase: 0.2, modulationFrequency: 5, modulationIndex: 0.6, modulationPhase: 0.3, offset: 0.1, noiseSigma: 0.02, condition: "am" };
assert.equal(runExperiment({ params: amParams }).result.recommendedId, "am");

const generated = generateRandomSignal({ condition: "clean", seed: 7 });
assert.ok(generated.params && generated.groundTruth && generated.conditions && generated.data);
assert.equal(generated.data.time.length, generated.params.n);

const classifiedError = classifyOutcome(null, { fs: 1000 }, {}, new Error("至少需要 64 个样本。"));
assert.equal(classifiedError.verdict, "input-rejected");
assert.equal(classifiedError.rejected, true);

assert.equal(runExperiment({ condition: "harmonics", seed: 42 }).result.recommendedId, "multi_tone_3");
assert.equal(runExperiment({ condition: "mains-hum", seed: 42 }).result.recommendedId, "multi_tone_2");
const exactNyquist = runExperiment({ condition: "exact-nyquist", seed: 42 });
assert.ok(exactNyquist.conditions.some((condition) => condition.includes("恰为 Nyquist")));
assert.equal(runExperiment({ condition: "invalid-nan", seed: 42 }).outcome.rejected, true);
assert.equal(runExperiment({ condition: "invalid-toolong", seed: 42 }).outcome.rejected, true);

console.log("Generator tests passed", {
  conditions: CONDITION_CATALOG.length,
  aliasingVerdict: aliasing.outcome.verdict,
  fmModel: fm.result.recommendedId,
});