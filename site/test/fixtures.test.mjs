import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv } from "../dist/csv.js";
import { analyzeSignal, analyzeIqSignal } from "../dist/dsp.js";

const manifest = JSON.parse(readFileSync(new URL("./fixtures/manifest.json", import.meta.url), "utf8"));

function assertResult(result, expect, label) {
  if ("unknown" in expect) assert.equal(result.unknown, expect.unknown, `${label} unknown`);
  if ("model" in expect) assert.equal(result.recommendedId, expect.model, `${label} model`);
  if ("reliability" in expect) assert.equal(result.reliability.level, expect.reliability, `${label} reliability`);
  if ("health" in expect) assert.equal(result.health.status, expect.health, `${label} health`);
  if ("minR2" in expect) {
    assert.ok(result.best, `${label} has best candidate`);
    assert.ok(result.best.metrics.r2 >= expect.minR2, `${label} R2 ${result.best.metrics.r2}`);
  }
  for (const [id, status] of Object.entries(expect.healthChecks ?? {})) {
    const check = result.health.checks.find((item) => item.id === id);
    assert.ok(check, `${label} health check ${id} exists`);
    assert.equal(check.status, status, `${label} health check ${id}`);
  }
  for (const param of expect.params ?? []) {
    const actual = result.best.parameters.find((item) => item.id === param.id);
    assert.ok(actual, `${label} parameter ${param.id} exists`);
    assert.ok(
      Math.abs(actual.value - param.value) <= param.tolerance,
      `${label} ${param.id} = ${actual.value}, expected ${param.value} ± ${param.tolerance}`,
    );
  }
}

const summary = [];
for (const fixture of manifest.fixtures) {
  assert.equal(fixture.simulated, true, `${fixture.file} must be labeled simulated`);
  const text = readFileSync(new URL(`./fixtures/${fixture.file}`, import.meta.url), "utf8");
  const parsed = parseCsv(text);
  assert.equal(parsed.delimiter, fixture.delimiter, `${fixture.file} delimiter`);
  assert.equal(parsed.rows.length, fixture.sampleCount, `${fixture.file} row count`);
  assert.equal(parsed.timeCandidate.header, fixture.timeHeader, `${fixture.file} time column`);
  const time = parsed.timeCandidate.values;

  if (fixture.kind === "iq") {
    const iColumn = parsed.numericColumns.find((column) => /^i([_\s-]|$)/i.test(column.header));
    const qColumn = parsed.numericColumns.find((column) => /^q([_\s-]|$)/i.test(column.header));
    assert.ok(iColumn && qColumn, `${fixture.file} I/Q auto-detection`);
    assert.notEqual(iColumn.header, qColumn.header, `${fixture.file} I/Q distinct`);
    assert.notEqual(iColumn.header, fixture.timeHeader, `${fixture.file} I != time`);
    assert.notEqual(qColumn.header, fixture.timeHeader, `${fixture.file} Q != time`);
    const result = analyzeIqSignal(time, iColumn.values, qColumn.values);
    assert.equal(result.kind, "iq", `${fixture.file} kind`);
    assertResult(result, fixture.expect, fixture.file);
    summary.push({ file: fixture.file, model: result.recommendedId });
    continue;
  }

  if (fixture.kind === "multi") {
    const columns = parsed.numericColumns.filter((column) => column !== parsed.timeCandidate);
    assert.equal(columns.length, fixture.expect.channels.length, `${fixture.file} channel count`);
    for (const channel of fixture.expect.channels) {
      const column = columns.find((item) => item.header === channel.header);
      assert.ok(column, `${fixture.file} channel ${channel.header} exists`);
      const result = analyzeSignal(time, column.values);
      assertResult(result, channel, `${fixture.file}:${channel.header}`);
    }
    summary.push({ file: fixture.file, channels: columns.length });
    continue;
  }

  const result = analyzeSignal(time, parsed.signalCandidate.values);
  assert.equal(result.kind, "real", `${fixture.file} kind`);
  assertResult(result, fixture.expect, fixture.file);
  summary.push({ file: fixture.file, model: result.recommendedId, unknown: result.unknown });
}

assert.equal(summary.length, manifest.fixtures.length);
console.log("Fixture tests passed", summary);