import assert from "node:assert/strict";
import { analyzeSignal, analyzeIqSignal, buildAiPayload } from "../dist/dsp.js";
import { buildReport } from "../dist/service.js";

const fs = 1024;
const n = 2048;
const time = Array.from({ length: n }, (_, index) => index / fs);
const values = time.map((t) => 0.1 + 2 * Math.sin(2 * Math.PI * 93.7 * t + 0.4));
const result = analyzeSignal(time, values);

assert.equal(result.kind, "real");
for (const key of ["createdAt", "sampleCount", "sampleRate", "duration", "nyquist", "spectrum", "health", "candidates", "unknown", "recommendedId", "reliability", "series"]) {
  assert.ok(key in result, `result missing ${key}`);
}
assert.ok(["ok", "warn", "fail"].includes(result.health.status));
assert.ok(Array.isArray(result.health.checks));
assert.ok(["reliable", "caution", "unreliable", "insufficient_evidence"].includes(result.reliability.level));
assert.ok(Array.isArray(result.reliability.evidence));
assert.ok(Array.isArray(result.reliability.limitations));
assert.ok(result.candidates.length > 0);
for (const candidate of result.candidates) {
  assert.ok(!("fitted" in candidate) && !("residual" in candidate), "candidates must be summaries");
  for (const key of ["id", "family", "label", "parameters", "metrics"]) assert.ok(key in candidate, `candidate missing ${key}`);
  for (const parameter of candidate.parameters) {
    for (const key of ["id", "label", "value", "unit"]) assert.ok(key in parameter, `parameter missing ${key}`);
    assert.equal(typeof parameter.value, "number");
  }
}
assert.ok(!("fitted" in result.best) && !("residual" in result.best));
assert.equal(result.series.observed.length, n);
assert.equal(result.series.fitted.length, n);
assert.equal(result.series.residual.length, n);

const payload = buildAiPayload(result);
for (const key of ["unknown", "recommendedModel", "sampleCount", "sampleRate", "duration", "candidates", "reliability"]) {
  assert.ok(key in payload, `payload missing ${key}`);
}
assert.ok(!("series" in payload));

const report = buildReport(result, "contract-test");
assert.equal(report.product, "SignalInsight");
for (const key of ["sampleCount", "sampleRateHz", "durationSeconds", "kind", "recommendedModel", "unknown", "reliability", "health", "experimentPlan", "candidates", "method"]) {
  assert.ok(key in report, `report missing ${key}`);
}
assert.ok(report.method.selection);

const iValues = time.map((t) => 0.1 + 2 * Math.cos(2 * Math.PI * 120 * t + 0.3));
const qValues = time.map((t) => 0.05 + 2 * Math.sin(2 * Math.PI * 120 * t + 0.3));
const iq = analyzeIqSignal(time, iValues, qValues);
assert.equal(iq.kind, "iq");
assert.equal(iq.recommendedId, "iq_single");
assert.ok(iq.iq && "q" in iq.iq && "fittedQ" in iq.iq);

console.log("Contract tests passed", {
  kind: result.kind,
  candidates: result.candidates.length,
  reliability: result.reliability.level,
  reportKeys: Object.keys(report).length,
});