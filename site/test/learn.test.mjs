import assert from "node:assert/strict";
import { listScenarios, getScenario, generateScenarioSignal, analyzeScenario } from "../dist/learn.js";

const list = listScenarios();
assert.equal(list.length, 2);
assert.ok(list.every((scenario) => scenario.id && scenario.title && scenario.category && scenario.summary));

const clean = getScenario("clean-single");
assert.ok(clean.principle.points.length >= 3);
assert.ok(clean.principle.evidenceIds.length > 0);
assert.ok(clean.questions.length >= 1);
assert.deepEqual(clean.steps, ["observe", "hypothesize", "verify", "conclude"]);
assert.equal(clean.diagnosis, null);

const clipped = getScenario("clipped-tone");
assert.ok(clipped.diagnosis.issues.length > 0);
assert.ok(clipped.diagnosis.causes.length > 0);
assert.ok(clipped.diagnosis.improvements.length > 0);

assert.equal(getScenario("nope"), null);
assert.throws(() => generateScenarioSignal("nope"), /未知学习场景/);
assert.throws(() => analyzeScenario("nope"), /未知学习场景/);

const signal = generateScenarioSignal("clean-single");
assert.equal(signal.kind, "real");
assert.equal(signal.time.length, 2048);
assert.equal(signal.values.length, 2048);

const cleanAnalysis = analyzeScenario("clean-single");
assert.equal(cleanAnalysis.match.ok, true, `clean match ${JSON.stringify(cleanAnalysis.match)}`);
assert.equal(cleanAnalysis.result.recommendedId, "single_tone");
const frequency = cleanAnalysis.result.best.parameters.find((parameter) => parameter.id === "frequency_1").value;
assert.ok(Math.abs(frequency - 93.7) < 0.1, `clean frequency ${frequency}`);

const clipAnalysis = analyzeScenario("clipped-tone");
assert.equal(clipAnalysis.match.ok, true, `clip match ${JSON.stringify(clipAnalysis.match)}`);
assert.equal(clipAnalysis.result.health.status, "fail");
assert.equal(clipAnalysis.result.health.checks.find((check) => check.id === "clipping").status, "fail");
assert.equal(clipAnalysis.result.reliability.level, "unreliable");

console.log("Learn tests passed", {
  scenarios: list.length,
  cleanModel: cleanAnalysis.result.recommendedId,
  cleanFrequency: frequency,
  clipHealth: clipAnalysis.result.health.status,
  clipReliability: clipAnalysis.result.reliability.level,
});