import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMat } from "../dist/mat.js";

const buffer = readFileSync(new URL("./fixtures/two-column.mat", import.meta.url));
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const variables = parseMat(arrayBuffer);

const signal = variables.find((variable) => variable.name === "signal");
assert.ok(signal);
assert.equal(signal.rows, 64);
assert.equal(signal.cols, 2);
assert.ok(Math.abs(signal.values[0][0]) < 1e-12);
assert.ok(Math.abs(signal.values[0][1] - 0.1) < 1e-6);
assert.equal(signal.complex, false);

const single = variables.find((variable) => variable.name === "single");
assert.ok(single);
assert.equal(single.rows, 64);
assert.equal(single.cols, 1);

assert.throws(() => parseMat(new ArrayBuffer(16)), /MAT/);

console.log("MAT tests passed", variables.map((variable) => variable.name));
