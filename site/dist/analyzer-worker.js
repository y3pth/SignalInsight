import { analyzeIqSignal, analyzeSignal, stressTest } from "./dsp.js?v=11";

self.onmessage = (event) => {
  const { id, type, time, values, qValues, baseline } = event.data ?? {};
  try {
    const result = type === "stress"
      ? stressTest(time, values, baseline)
      : type === "iq"
        ? analyzeIqSignal(time, values, qValues)
        : analyzeSignal(time, values);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : "分析失败。" });
  }
};
