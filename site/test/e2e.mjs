import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");
const fixtures = path.resolve(here, "fixtures");

const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];

function startServer() {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };
  const server = createServer((request, response) => {
    const urlPath = decodeURIComponent((request.url ?? "/").split("?")[0]);
    const file = path.join(dist, urlPath === "/" ? "index.html" : urlPath);
    if (!file.startsWith(dist) || !existsSync(file)) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

async function waitForDebugger(port, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const info = await response.json();
        if (info.webSocketDebuggerUrl) return info;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("browser debugger did not become ready");
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  on(listener) {
    this.listeners.push(listener);
  }
}

const analyzeExpression = (marker) => `(async () => {
  document.querySelector('#analyze-button').click();
  const start = Date.now();
  let toast = '';
  while (Date.now() - start < 30000) {
    toast = document.querySelector('#toast')?.textContent || '';
    if (toast.includes('分析完成') && toast.includes('${marker}')) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    conclusion: document.querySelector('#conclusion-title')?.textContent || '',
    confidence: document.querySelector('#conclusion-confidence')?.textContent || '',
    subtitle: document.querySelector('#result-subtitle')?.textContent || '',
    health: document.querySelector('#health-status')?.textContent || '',
    toast,
    params: Array.from(document.querySelectorAll('#parameter-body tr')).map((tr) => Array.from(tr.children).map((td) => td.textContent)),
  };
})()`;

function frequencyFromParams(params) {
  const row = params.find((cells) => cells[2] === "Hz" && String(cells[0]).startsWith("频率"));
  return row ? Number.parseFloat(row[1]) : null;
}

const { server, port } = await startServer();
const userDataDir = mkdtempSync(path.join(tmpdir(), "si-e2e-"));
const debugPort = 9333;
const executable = BROWSERS.find((candidate) => existsSync(candidate));
assert.ok(executable, "no Chrome/Edge executable found for E2E");
const browser = spawn(executable, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  `--remote-debugging-port=${debugPort}`,
  "--remote-allow-origins=*",
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: "ignore" });

const summary = [];
try {
  const info = await waitForDebugger(debugPort);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("CDP websocket error")), { once: true });
  });
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Log.enable", {}, sessionId);

  const consoleErrors = [];
  cdp.on((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text ?? "exception");
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
    } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      const entry = message.params.entry;
      consoleErrors.push(`${entry.text} ${entry.url ?? ""}`.trim());
    }
  });

  async function navigate(url) {
    const loaded = new Promise((resolve) => {
      cdp.on((message) => {
        if (message.sessionId === sessionId && message.method === "Page.loadEventFired") resolve();
      });
    });
    await cdp.send("Page.navigate", { url }, sessionId);
    await loaded;
  }

  async function evaluate(expression) {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) {
      throw new Error(`page evaluation failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    }
    return result.result.value;
  }

  async function upload(selector, file) {
    const { root } = await cdp.send("DOM.getDocument", {}, sessionId);
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector }, sessionId);
    assert.ok(nodeId, `file input not found: ${selector}`);
    await cdp.send("DOM.setFileInputFiles", { files: [path.join(fixtures, file)], nodeId }, sessionId);
    const settled = await evaluate(`(async () => {
      const start = Date.now();
      while (Date.now() - start < 10000) {
        const preview = document.querySelector('#csv-preview');
        if (preview && preview.hidden === false && preview.textContent.includes('${file}')) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    })()`);
    assert.ok(settled, `upload mapping did not complete for ${file}`);
  }

  const baseUrl = `http://127.0.0.1:${port}/index.html`;

  await navigate(baseUrl);
  const initial = await evaluate(analyzeExpression("内置单频样例"));
  assert.ok(initial.conclusion.includes("单频"), `initial model: ${initial.conclusion}`);
  assert.ok(initial.subtitle.includes("Worker"), `initial engine: ${initial.subtitle}`);
  assert.ok(Math.abs(frequencyFromParams(initial.params) - 93.7) < 0.1, "initial frequency");
  summary.push({ scenario: "default-example", model: initial.conclusion });

  const modelPicker = await evaluate("(() => ({ exists: !!document.querySelector('#model-select'), options: Array.from(document.querySelector('#model-select')?.options || []).map((o) => o.value), value: document.querySelector('#model-select')?.value }))()");
  assert.ok(modelPicker.exists, "model selector present");
  assert.deepEqual(modelPicker.options, ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-long"], "model whitelist options");
  assert.equal(modelPicker.value, "qwen-plus", "default model");
  summary.push({ scenario: "model-selector", options: modelPicker.options.length });

  await upload("#csv-file", "single-tone-noisy.csv");
  const stale = await evaluate("(() => ({ downloadDisabled: document.querySelector('#download-button')?.disabled, aiDisabled: document.querySelector('#ai-button')?.disabled }))()");
  assert.equal(stale.downloadDisabled, true, "upload must invalidate export");
  const single = await evaluate(analyzeExpression("single-tone-noisy.csv"));
  assert.ok(single.conclusion.includes("单频"), `single model: ${single.conclusion}`);
  assert.ok(single.subtitle.includes("Worker"), `single engine: ${single.subtitle}`);
  assert.ok(Math.abs(frequencyFromParams(single.params) - 93.7) < 0.1, `single frequency: ${frequencyFromParams(single.params)}`);
  assert.ok(single.toast.includes("single-tone-noisy.csv"), "single scenario analyzed the fixture");
  summary.push({ scenario: "single-fixture", model: single.conclusion, frequency: frequencyFromParams(single.params) });

  await upload("#csv-file", "multi-channel.csv");
  const channels = await evaluate(`(async () => {
    document.querySelector('#channel-button').click();
    const start = Date.now();
    let rows = 0;
    while (Date.now() - start < 60000) {
      rows = document.querySelector('#channel-list')?.children.length || 0;
      if (rows >= 3) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    return { rows, text: document.querySelector('#channel-list')?.innerText || '', summary: document.querySelector('#channel-summary')?.textContent || '' };
  })()`);
  assert.equal(channels.rows, 3, `channel count: ${channels.rows}`);
  assert.ok(channels.text.includes("ch1") && channels.text.includes("ch2") && channels.text.includes("ch3"), "channel labels");
  summary.push({ scenario: "multi-channel", channels: channels.rows });

  await upload("#csv-file", "iq-single.csv");
  const iqMapping = await evaluate("(() => ({ iq: document.querySelector('#iq-mode')?.checked, signal: document.querySelector('#signal-column')?.value, q: document.querySelector('#q-column')?.value, channelHidden: document.querySelector('#channel-card')?.hidden }))()");
  assert.equal(iqMapping.iq, true, "IQ auto-detection");
  assert.equal(iqMapping.signal, "I");
  assert.equal(iqMapping.q, "Q");
  assert.equal(iqMapping.channelHidden, true, "IQ hides channel card");
  const iq = await evaluate(analyzeExpression("iq-single.csv"));
  assert.ok(iq.conclusion.includes("IQ"), `IQ model: ${iq.conclusion}`);
  assert.ok(iq.subtitle.includes("Worker"), `IQ engine: ${iq.subtitle}`);
  assert.ok(iq.toast.includes("iq-single.csv"), "IQ scenario analyzed the fixture");
  summary.push({ scenario: "iq-fixture", model: iq.conclusion });

  await upload("#csv-file", "noise-only.csv");
  const noise = await evaluate(analyzeExpression("noise-only.csv"));
  assert.ok(noise.conclusion.includes("暂不推荐"), `noise conclusion: ${noise.conclusion}`);
  assert.ok(noise.params.some((cells) => cells[0] === "无可靠参数估计"), "noise refuses parameters");
  assert.ok(noise.toast.includes("noise-only.csv"), "noise scenario analyzed the fixture");
  summary.push({ scenario: "noise-fixture", conclusion: noise.conclusion });

  await upload("#csv-file", "am-noisy.csv");
  const am = await evaluate(analyzeExpression("am-noisy.csv"));
  assert.ok(am.conclusion.includes("AM"), `AM model: ${am.conclusion}`);
  const amModulation = await evaluate("(() => ({ labHidden: document.querySelector('#modulation-lab')?.hidden, sidebands: document.querySelector('#modulation-sidebands')?.children.length || 0, type: document.querySelector('#modulation-type')?.textContent || '' }))()");
  assert.equal(amModulation.labHidden, false, "AM modulation lab visible");
  assert.ok(amModulation.sidebands >= 3, `AM sidebands: ${amModulation.sidebands}`);
  summary.push({ scenario: "am-modulation", model: am.conclusion, sidebands: amModulation.sidebands });

  const stress = await evaluate(`(async () => {
    document.querySelector('#stress-button').click();
    const start = Date.now();
    let rows = 0;
    while (Date.now() - start < 60000) {
      rows = document.querySelector('#stress-list')?.children.length || 0;
      if (rows >= 4) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    return { rows, summary: document.querySelector('#stress-summary')?.textContent || '' };
  })()`);
  assert.equal(stress.rows, 4, `stress variants: ${stress.rows}`);
  assert.ok(stress.summary.length > 0, "stress summary present");
  summary.push({ scenario: "stress-test", variants: stress.rows });

  await evaluate("(() => { window.__report = null; window.__origCreate = URL.createObjectURL; URL.createObjectURL = (blob) => { blob.text().then((t) => { window.__report = t; }); return window.__origCreate(blob); }; return true; })()");
  await evaluate("(() => { document.querySelector('#download-button').click(); return true; })()");
  const reportText = await evaluate("(async () => { const start = Date.now(); while (Date.now() - start < 5000) { if (window.__report) break; await new Promise((r) => setTimeout(r, 100)); } URL.createObjectURL = window.__origCreate; return window.__report; })()");
  assert.ok(reportText, "export produced a report");
  const report = JSON.parse(reportText);
  assert.equal(report.product, "SignalInsight");
  assert.ok(Array.isArray(report.candidates) && report.candidates.length > 0, "report candidates");
  assert.ok(report.method && report.method.selection, "report method boundaries");
  assert.ok("unknown" in report && "reliability" in report && "health" in report, "report trust fields");
  summary.push({ scenario: "export-report", candidates: report.candidates.length });

  await upload("#csv-file", "fm-noisy.csv");
  const fm = await evaluate(analyzeExpression("fm-noisy.csv"));
  assert.ok(fm.conclusion.includes("FM"), `FM model: ${fm.conclusion}`);
  const fmModulation = await evaluate("(() => ({ labHidden: document.querySelector('#modulation-lab')?.hidden, sidebands: document.querySelector('#modulation-sidebands')?.children.length || 0 }))()");
  assert.equal(fmModulation.labHidden, false, "FM modulation lab visible");
  assert.ok(fmModulation.sidebands >= 5, `FM sidebands: ${fmModulation.sidebands}`);
  summary.push({ scenario: "fm-modulation", model: fm.conclusion, sidebands: fmModulation.sidebands });

  await upload("#csv-file", "clipped-tone.csv");
  const clipped = await evaluate(analyzeExpression("clipped-tone.csv"));
  assert.equal(clipped.health, "有异常", `clipped health: ${clipped.health}`);
  const healthText = await evaluate("(() => document.querySelector('#health-list')?.textContent || '')()");
  assert.ok(healthText.includes("削顶"), "clipping flagged in health list");
  summary.push({ scenario: "defect-health", health: clipped.health });

  await upload("#mat-file", "two-column.mat");
  const mat = await evaluate(analyzeExpression("two-column.mat"));
  assert.ok(mat.toast.includes("two-column.mat"), "MAT scenario analyzed the fixture");
  assert.ok(mat.conclusion.includes("推荐") || mat.conclusion.includes("暂不推荐"), `MAT conclusion: ${mat.conclusion}`);
  summary.push({ scenario: "mat-import", conclusion: mat.conclusion });

  const historyBefore = await evaluate("(() => ({ count: document.querySelectorAll('#history-list .history-item').length, stored: JSON.parse(localStorage.getItem('signalinsight.history.v1') || '[]').length }))()");
  assert.ok(historyBefore.count >= 3, `history entries: ${historyBefore.count}`);
  assert.equal(historyBefore.count, historyBefore.stored, "history list matches localStorage");
  const conclusionBefore = await evaluate("(() => document.querySelector('#conclusion-title')?.textContent)()");
  await evaluate("(() => { document.querySelector('#history-list .history-item').click(); return true; })()");
  const detail = await evaluate("(() => ({ hidden: document.querySelector('#history-detail')?.hidden, text: document.querySelector('#history-detail')?.textContent || '' }))()");
  assert.equal(detail.hidden, false, "history detail opens");
  assert.ok(detail.text.includes("历史快照"), "history detail labeled as snapshot");
  const conclusionAfter = await evaluate("(() => document.querySelector('#conclusion-title')?.textContent)()");
  assert.equal(conclusionAfter, conclusionBefore, "viewing history must not alter the current result");

  await navigate(baseUrl);
  const historyReload = await evaluate("(() => document.querySelectorAll('#history-list .history-item').length)()");
  assert.ok(historyReload >= historyBefore.count, `history persists across reload: ${historyReload}`);
  await evaluate("(() => { document.querySelector('#history-clear').click(); return true; })()");
  const cleared = await evaluate("(() => ({ items: document.querySelectorAll('#history-list .history-item').length, stored: JSON.parse(localStorage.getItem('signalinsight.history.v1') || '[]').length, empty: document.querySelector('#history-list')?.textContent || '' }))()");
  assert.equal(cleared.items, 0, "history cleared from list");
  assert.equal(cleared.stored, 0, "history cleared from storage");
  assert.ok(cleared.empty.includes("暂无历史"), "history empty state");
  summary.push({ scenario: "history", entries: historyBefore.count, persisted: historyReload });

  const benignNetwork = (text) =>
    text.includes("/functions/v1/app/health") || text.includes("favicon.ico") || text.startsWith("Failed to load resource");
  const realErrors = consoleErrors.filter((text) => !benignNetwork(text));
  assert.deepEqual(realErrors, [], `unexpected console errors: ${realErrors.join(" | ")}`);
  summary.push({ scenario: "console", unexpectedErrors: realErrors.length });

  ws.close();
} finally {
  browser.kill();
  if (process.platform === "win32" && browser.pid) {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(browser.pid)], { stdio: "ignore" });
  }
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    browser.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  server.close();
  try {
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {}
}

console.log("E2E tests passed", summary);