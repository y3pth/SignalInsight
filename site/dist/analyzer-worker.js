import { analyzeSignal } from "./dsp.js";

self.onmessage = (event) => {
  const { id, time, values } = event.data ?? {};
  try {
    const result = analyzeSignal(time, values);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : "分析失败。" });
  }
};
