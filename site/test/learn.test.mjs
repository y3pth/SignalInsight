import assert from "node:assert/strict";
import { listScenarios, getScenario, generateScenarioSignal, analyzeScenario, buildLearnPayload } from "../dist/learn.js";

const list = listScenarios();
assert.equal(list.length, 15);
assert.ok(list.every((scenario) => scenario.id && scenario.title && scenario.category && scenario.summary));

for (const meta of list) {
  const { scenario, result, match } = analyzeScenario(meta.id);
  assert.equal(match.ok, true, `${meta.id} match ${JSON.stringify(match.checks)} expected ${JSON.stringify(scenario.expected)}`);
  assert.ok(scenario.principle.points.length >= 3, `${meta.id} principle points`);
  assert.ok(scenario.principle.evidenceIds.length > 0, `${meta.id} evidence ids`);
  assert.ok(scenario.questions.length >= 1, `${meta.id} questions`);
  assert.deepEqual(scenario.steps, ["observe", "hypothesize", "verify", "conclude"]);
  assert.ok(result.series.observed.length === scenario.signal.n, `${meta.id} sample count`);
}

const clean = analyzeScenario("clean-single");
assert.equal(clean.result.recommendedId, "single_tone");
const frequency = clean.result.best.parameters.find((parameter) => parameter.id === "frequency_1").value;
assert.ok(Math.abs(frequency - 93.7) < 0.1, `clean frequency ${frequency}`);

assert.equal(analyzeScenario("dual-tone").result.recommendedId, "multi_tone_2");
assert.equal(analyzeScenario("am-tone").result.recommendedId, "am");
assert.equal(analyzeScenario("fm-tone").result.recommendedId, "fm");

const clipped = analyzeScenario("clipped-tone");
assert.equal(clipped.result.health.status, "fail");
assert.equal(clipped.result.health.checks.find((check) => check.id === "clipping").status, "fail");
assert.equal(clipped.result.reliability.level, "unreliable");
assert.ok(clipped.scenario.diagnosis.issues.length > 0);

assert.equal(analyzeScenario("drift-tone").result.unknown, true);
assert.equal(analyzeScenario("quantized-tone").result.health.checks.find((check) => check.id === "quantization").status, "fail");
assert.equal(analyzeScenario("jittered-tone").result.recommendedId, "single_tone");
assert.equal(analyzeScenario("chirp").result.unknown, true);
assert.equal(analyzeScenario("pure-noise").result.unknown, true);

const iq = analyzeScenario("iq-single");
assert.equal(iq.result.kind, "iq");
assert.equal(iq.result.recommendedId, "iq_single");
assert.ok(iq.result.iq && "q" in iq.result.iq);
const iqFrequency = iq.result.best.parameters.find((parameter) => parameter.id === "frequency_1").value;
assert.ok(Math.abs(iqFrequency - 120) < 0.1, `iq frequency ${iqFrequency}`);

assert.notEqual(analyzeScenario("weak-modulation").result.recommendedId, "am");
assert.equal(analyzeScenario("low-snr").result.reliability.level, "unreliable");
assert.equal(analyzeScenario("short-record").result.reliability.level, "caution");
const nearNyquist = analyzeScenario("near-nyquist");
assert.equal(nearNyquist.result.health.checks.find((check) => check.id === "nyquist").status, "warn");

assert.equal(getScenario("nope"), null);
assert.throws(() => generateScenarioSignal("nope"), /未知学习场景/);
assert.throws(() => analyzeScenario("nope"), /未知学习场景/);

const scenario = getScenario("clean-single");
const result = clean.result;
const scenarioSnapshot = structuredClone(scenario);
const resultSnapshot = structuredClone(result);
const payload = buildLearnPayload(scenario, result);
assert.deepEqual(scenario, scenarioSnapshot, "buildLearnPayload must not mutate scenario");
assert.deepEqual(result, resultSnapshot, "buildLearnPayload must not mutate result");
assert.equal(payload.scenarioId, "clean-single");
assert.ok(payload.concept.length > 0);
assert.ok(payload.points.length >= 3);
assert.equal(payload.recommendedModel, result.best.label);
assert.equal(payload.unknown, false);
assert.equal(payload.reliabilityLevel, "reliable");
const expectedEvidence = result.reliability.evidence.filter((item) => scenario.principle.evidenceIds.includes(item.id));
assert.equal(payload.evidence.length, expectedEvidence.length);
assert.ok(payload.evidence.every((item) => item.label && "status" in item));
assert.ok(!("series" in payload), "learn payload must not carry raw series");

const noResultPayload = buildLearnPayload(scenario, null);
assert.equal(noResultPayload.unknown, null);
assert.deepEqual(noResultPayload.evidence, []);

console.log("Learn tests passed", {
  scenarios: list.length,
  cleanFrequency: frequency,
  payloadEvidence: payload.evidence.length,
});