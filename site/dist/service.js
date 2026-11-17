import { analyzeSignal, analyzeIqSignal, stressTest, buildExperimentPlan } from "./dsp.js?v=9";

let analyzerWorker = null;
let analyzerRequestId = 0;
const analyzerPending = new Map();
const ANALYZER_TIMEOUT_MS = 90000;

function getAnalyzerWorker() {
  if (analyzerWorker || typeof Worker === "undefined") return analyzerWorker;
  try {
    analyzerWorker = new Worker(new URL("./analyzer-worker.js?v=9", import.meta.url), { type: "module" });
    analyzerWorker.addEventListener("message", (event) => {
      const { id, ok, result, error } = event.data ?? {};
      const pending = analyzerPending.get(id);
      if (!pending) return;
      analyzerPending.delete(id);
      clearTimeout(pending.timeout);
      if (ok) pending.resolve(result);
      else pending.reject(new Error(error || "分析失败。"));
    });
    analyzerWorker.addEventListener("error", (event) => {
      const error = new Error(event.message || "分析 Worker 失败。");
      for (const pending of analyzerPending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      analyzerPending.clear();
      analyzerWorker?.terminate();
      analyzerWorker = null;
    });
  } catch {
    analyzerWorker = null;
  }
  return analyzerWorker;
}

function analyzeInWorker(worker, time, values, type = "analyze", baseline = null, qValues = null) {
  const id = ++analyzerRequestId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const entries = [...analyzerPending.values()];
      analyzerPending.clear();
      analyzerWorker?.terminate();
      analyzerWorker = null;
      const error = new Error("分析超时，请降低样本量或重试。");
      error.name = "AnalyzerTimeoutError";
      for (const pending of entries) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
    }, ANALYZER_TIMEOUT_MS);
    analyzerPending.set(id, { resolve, reject, timeout });
    try {
      worker.postMessage({ id, type, time, values, qValues, baseline });
    } catch (error) {
      analyzerPending.delete(id);
      clearTimeout(timeout);
      reject(error);
    }
  });
}

export async function analyzeSignalSafely(time, values) {
  const worker = getAnalyzerWorker();
  if (!worker) {
    const result = analyzeSignal(time, values);
    result.engine = "main";
    return result;
  }
  try {
    const result = await analyzeInWorker(worker, time, values);
    result.engine = "worker";
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AnalyzerTimeoutError") throw error;
    const result = analyzeSignal(time, values);
    result.engine = "main";
    return result;
  }
}

export async function analyzeIqSafely(time, iValues, qValues) {
  const worker = getAnalyzerWorker();
  if (!worker) {
    const result = analyzeIqSignal(time, iValues, qValues);
    result.engine = "main";
    return result;
  }
  try {
    const result = await analyzeInWorker(worker, time, iValues, "iq", null, qValues);
    result.engine = "worker";
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AnalyzerTimeoutError") throw error;
    const result = analyzeIqSignal(time, iValues, qValues);
    result.engine = "main";
    return result;
  }
}

export async function stressTestSafely(time, values, baseline) {
  const worker = getAnalyzerWorker();
  if (!worker) return stressTest(time, values, baseline);
  try {
    return await analyzeInWorker(worker, time, values, "stress", baseline);
  } catch (error) {
    if (error instanceof Error && error.name === "AnalyzerTimeoutError") throw error;
    return stressTest(time, values, baseline);
  }
}

export async function fetchAiHealth() {
  try {
    const response = await fetch("/functions/v1/app/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    const configured = Boolean(response.ok && data?.configured);
    return { configured, health: configured ? "configured" : "not_configured", provider: data?.provider ?? null };
  } catch {
    return { configured: false, health: "unreachable", provider: null };
  }
}

export const AI_ERROR_MESSAGES = {
  service_not_configured: "Qwen 密钥尚未配置，继续显示确定性规则解释。",
  upstream_error: "Qwen 上游返回错误，请检查 Key、模型名或额度。",
  upstream_unavailable: "Qwen 服务暂时不可用，请稍后重试。",
  invalid_model_output: "Qwen 返回格式不符合要求，请重试。",
  invalid_upstream_response: "Qwen 返回内容异常，请重试。",
  payload_too_large: "发送给 Qwen 的摘要过大，请减少数据量。",
  invalid_payload: "发送给 Qwen 的摘要格式无效。",
  invalid_json: "请求格式错误。",
  rate_limited: "请求过于频繁，请稍后再试。",
};

export async function fetchExplanation(payload, model, signal) {
  const response = await fetch("/functions/v1/app/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, model }),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || !data?.explanation) {
    throw new Error(AI_ERROR_MESSAGES[data?.error] ?? "Qwen 暂不可用，继续显示确定性规则解释。");
  }
  return data.explanation;
}

export function buildReport(result, sourceLabel) {
  return {
    product: "SignalInsight",
    version: "0.1.0-sites",
    generatedAt: new Date().toISOString(),
    source: sourceLabel,
    sampleCount: result.sampleCount,
    sampleRateHz: result.sampleRate,
    durationSeconds: result.duration,
    kind: result.kind,
    recommendedModel: result.recommendedId,
    unknown: result.unknown,
    reliability: result.reliability,
    health: result.health,
    experimentPlan: buildExperimentPlan(result),
    modulation: result.best?.modulationView
      ? {
          type: result.best.modulationView.type,
          carrierFrequency: result.best.modulationView.carrierFrequency,
          modulationFrequency: result.best.modulationView.modulationFrequency,
          modulationIndex: result.best.modulationView.modulationIndex,
          frequencyDeviation: result.best.modulationView.frequencyDeviation ?? null,
          sidebands: result.best.modulationView.sidebands,
        }
      : null,
    candidates: result.candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      parameters: candidate.parameters,
      metrics: candidate.metrics,
      residualAnalysis: candidate.residualAnalysis,
    })),
    method: {
      spectrum: "Hann-windowed FFT",
      fitting: "variable projection + golden-section frequency refinement",
      selection: "BIC with residual evidence",
    },
  };
}

const HISTORY_KEY = "signalinsight.history.v1";
const HISTORY_LIMIT = 20;

function summarizeResult(result, source) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    source,
    kind: result.kind,
    modelLabel: result.unknown ? "暂不推荐模型" : (result.best?.label ?? "—"),
    unknown: result.unknown,
    reliabilityLevel: result.reliability.level,
    reliabilityLabel: result.reliability.label,
    sampleCount: result.sampleCount,
    sampleRate: result.sampleRate,
    healthStatus: result.health.status,
    bicGap: result.reliability.bicGap ?? null,
    parameters: (result.unknown ? [] : (result.best?.parameters ?? [])).map((parameter) => ({
      label: parameter.label,
      value: parameter.value,
      unit: parameter.unit,
      sigma: parameter.sigma ?? null,
      sigmaKind: parameter.sigmaKind ?? null,
    })),
  };
}

export function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry === "object" && entry.createdAt && entry.source).slice(0, HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

export function addHistory(result, source) {
  const entries = [summarizeResult(result, source), ...getHistory()].slice(0, HISTORY_LIMIT);
  return { entries, persisted: writeHistory(entries) };
}

export function clearHistoryStorage() {
  return { persisted: writeHistory([]) };
}