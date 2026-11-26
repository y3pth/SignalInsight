import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const jsFiles = readdirSync(dist).filter((file) => file.endsWith(".js"));

for (const file of jsFiles) {
  const check = spawnSync(process.execPath, ["--check", path.join(dist, file)], { encoding: "utf8" });
  assert.equal(check.status, 0, `syntax error in ${file}: ${check.stderr}`);
}

function versionsIn(text) {
  return [...text.matchAll(/\?v=(\d+)/g)].map((match) => match[1]);
}

function assertSingleVersion(texts, label) {
  const set = new Set(texts.flatMap(versionsIn));
  assert.ok(set.size <= 1, `${label} has mixed module versions: ${[...set].join(", ")}`);
  return [...set][0] ?? null;
}

const assetTexts = readdirSync(dist)
  .filter((file) => /\.(js|html|css)$/.test(file))
  .map((file) => readFileSync(path.join(dist, file), "utf8"));
const version = assertSingleVersion(assetTexts, "dist");
assert.ok(version, "dist must carry module version tags");
assert.throws(() => assertSingleVersion(["a.js?v=6", "b.js?v=7"], "synthetic"), /mixed module versions/);

function exportsOf(text) {
  const names = new Set();
  for (const match of text.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) names.add(match[1]);
  for (const match of text.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(match[1]);
  for (const match of text.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function importsOf(text) {
  const imports = [];
  for (const match of text.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*"\.\/([^"]+)"/g)) {
    const names = match[1].split(",").map((item) => item.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    imports.push({ names, target: match[2].replace(/\?v=\d+$/, "") });
  }
  return imports;
}

const exportCache = new Map();
for (const file of jsFiles) {
  const text = readFileSync(path.join(dist, file), "utf8");
  for (const imp of importsOf(text)) {
    const targetPath = path.join(dist, imp.target);
    assert.ok(existsSync(targetPath), `${file} imports missing file ${imp.target}`);
    if (!exportCache.has(imp.target)) {
      exportCache.set(imp.target, exportsOf(readFileSync(targetPath, "utf8")));
    }
    const exported = exportCache.get(imp.target);
    for (const name of imp.names) {
      assert.ok(exported.has(name), `${file} imports "${name}" which ${imp.target} does not export`);
    }
  }
}

const html = readFileSync(path.join(dist, "index.html"), "utf8");
for (const match of html.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?v=\d+)?"/g)) {
  assert.ok(existsSync(path.join(dist, match[1])), `index.html references missing asset ${match[1]}`);
}

const worker = readFileSync(path.join(dist, "analyzer-worker.js"), "utf8");
assert.ok(/from\s*"\.\/dsp\.js/.test(worker), "analyzer-worker.js must import dsp.js");

console.log("Static checks passed", { version, jsFiles });