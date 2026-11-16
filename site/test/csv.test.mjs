import assert from "node:assert/strict";
import { parseCsv, parseDelimited } from "../dist/csv.js";

assert.deepEqual(parseDelimited('a,"b,c","d""e"', ","), [["a", "b,c", 'd"e']]);

const simple = parseCsv("time,signal\n0,1\n0.1,2\n0.2,3");
assert.deepEqual(simple.headers, ["time", "signal"]);
assert.equal(simple.rows.length, 3);
assert.equal(simple.timeCandidate.header, "time");
assert.equal(simple.signalCandidate.header, "signal");

const semicolon = parseCsv("\uFEFFtime;signal\n0;1\n0.1;2\n0.2;3");
assert.equal(semicolon.delimiter, ";");
assert.deepEqual(semicolon.headers, ["time", "signal"]);

const tab = parseCsv("time\tsignal\n0\t1\n0.1\t2\n0.2\t3");
assert.equal(tab.delimiter, "\t");

const quoted = parseCsv('time,signal,note\n0,1,"a,b"\n0.1,2,"c"\n0.2,3,"d"');
assert.equal(quoted.headers.length, 3);
assert.equal(quoted.numericColumns.length, 2);

const quotedNewline = parseCsv('time,signal,note\n0,1,"line1\nline2"\n0.1,2,"x"\n0.2,3,"y"');
assert.equal(quotedNewline.rows.length, 3);
assert.equal(quotedNewline.headers.length, 3);
assert.equal(quotedNewline.numericColumns.length, 2);

const twoRows = parseCsv("time,signal\n0,1\n0.1,2");
assert.equal(twoRows.rows.length, 2);
assert.throws(() => parseCsv("time,signal\n0,1"), /至少需要/);

const crlf = parseCsv("time,signal\r\n0,1\r\n0.1,2\r\n0.2,3\r\n");
assert.equal(crlf.rows.length, 3);

const blanks = parseCsv("\n\ntime,signal\n0,1\n0.1,2\n0.2,3\n\n");
assert.equal(blanks.rows.length, 3);

const scientific = parseCsv("time,signal\n0,1e-1\n0.1,2e0\n0.2,-3e-1");
assert.equal(scientific.numericColumns.length, 2);

const quotedHeader = parseCsv('time,signal,"note, text"\n0,1,"a"\n0.1,2,"b"\n0.2,3,"c"');
assert.deepEqual(quotedHeader.headers, ["time", "signal", "note, text"]);

assert.throws(() => parseCsv("time,signal\n0,1\n0.1,2\n0.2,3,4"), /字段数/);
assert.throws(() => parseCsv("time,time\n0,1\n0.1,2\n0.2,3"), /重复表头/);
assert.throws(() => parseCsv("time,signal\n0,\n0.1,2\n0.2,3"), /两个以上/);
assert.throws(() => parseCsv("time\n0\n0.1\n0.2"), /至少需要|分隔符/);

const largeRows = ["time,signal"];
for (let index = 0; index < 50000; index += 1) {
  const t = index / 1000;
  largeRows.push(`${t.toFixed(6)},${(0.1 + 2 * Math.sin(2 * Math.PI * 50 * t)).toFixed(6)}`);
}
const largeStart = Date.now();
const large = parseCsv(largeRows.join("\n"));
const largeElapsed = Date.now() - largeStart;
assert.equal(large.rows.length, 50000);
assert.ok(largeElapsed < 3000, `large CSV parse ${largeElapsed}ms`);

console.log("CSV tests passed", { largeElapsedMs: largeElapsed });
