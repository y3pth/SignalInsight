import { analyzeSignal, stressTest } from "./dsp.js";

self.onmessage = (event) => {
  const { id, type, time, values, baseline } = event.data ?? {};
  try {
    const result = type === "stress"
      ? stressTest(time, values, baseline)
      : analyzeSignal(time, values);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : "分析失败。" });
  }
};
