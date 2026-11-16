const TAU = Math.PI * 2;

export function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function rms(values) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
}

export function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size <<= 1;
  return size;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-TAU) / length;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let curRe = 1;
      let curIm = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddRe = re[odd] * curRe - im[odd] * curIm;
        const oddIm = re[odd] * curIm + im[odd] * curRe;
        re[odd] = re[even] - oddRe;
        im[odd] = im[even] - oddIm;
        re[even] += oddRe;
        im[even] += oddIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function computeSpectrum(values, sampleRate) {
  const n = values.length;
  const nfft = nextPowerOfTwo(n);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const center = mean(values);
  let windowSum = 0;
  for (let i = 0; i < n; i += 1) {
    const window = 0.5 - 0.5 * Math.cos((TAU * i) / Math.max(1, n - 1));
    re[i] = (values[i] - center) * window;
    windowSum += window;
  }
  fft(re, im);
  const frequencies = [];
  const amplitudes = [];
  const half = Math.floor(nfft / 2);
  for (let k = 1; k <= half; k += 1) {
    frequencies.push((k * sampleRate) / nfft);
    amplitudes.push((2 * Math.hypot(re[k], im[k])) / Math.max(windowSum, 1));
  }
  const medianAmplitude = median(amplitudes);
  const peaks = [];
  for (let i = 1; i < amplitudes.length - 1; i += 1) {
    const amp = amplitudes[i];
    if (amp > amplitudes[i - 1] && amp >= amplitudes[i + 1]) {
      peaks.push({
        frequency: frequencies[i],
        amplitude: amp,
        bin: i + 1,
        prominence: amp / Math.max(medianAmplitude, 1e-15),
      });
    }
  }
  peaks.sort((a, b) => b.amplitude - a.amplitude);
  return {
    frequencies,
    amplitudes,
    peaks,
    medianAmplitude,
    binWidth: sampleRate / nfft,
    nfft,
  };
}

function solveLinear(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error("singular least-squares system");
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

function fitAtFrequencies(tau, values, frequencies) {
  const columns = 1 + frequencies.length * 2;
  const normal = Array.from({ length: columns }, () => new Float64Array(columns));
  const rhs = new Float64Array(columns);
  for (let i = 0; i < tau.length; i += 1) {
    const row = [1];
    for (const frequency of frequencies) {
      row.push(Math.cos(TAU * frequency * tau[i]), Math.sin(TAU * frequency * tau[i]));
    }
    for (let a = 0; a < columns; a += 1) {
      rhs[a] += row[a] * values[i];
      for (let b = a; b < columns; b += 1) normal[a][b] += row[a] * row[b];
      }
  }
  for (let a = 0; a < columns; a += 1) {
    for (let b = 0; b < a; b += 1) normal[a][b] = normal[b][a];
  }
  const coefficients = solveLinear(normal.map((row) => [...row]), [...rhs]);
  const fitted = new Array(values.length);
  let rss = 0;
  for (let i = 0; i < tau.length; i += 1) {
    let prediction = coefficients[0];
    for (let k = 0; k < frequencies.length; k += 1) {
      prediction +=
        coefficients[1 + 2 * k] * Math.cos(TAU * frequencies[k] * tau[i]) +
        coefficients[2 + 2 * k] * Math.sin(TAU * frequencies[k] * tau[i]);
    }
    fitted[i] = prediction;
    rss += (values[i] - prediction) ** 2;
  }
  return { coefficients, fitted, rss };
}

function goldenMinimum(fn, left, right, iterations = 48) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = left;
  let b = right;
  let c = b - ratio * (b - a);
  let d = a + ratio * (b - a);
  let fc = fn(c);
  let fd = fn(d);
  for (let i = 0; i < iterations; i += 1) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - ratio * (b - a);
      fc = fn(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + ratio * (b - a);
      fd = fn(d);
    }
  }
  return (a + b) / 2;
}

function optimizeFrequencies(tau, values, initialFrequencies, nyquist, span) {
  let frequencies = [...initialFrequencies];
  for (let sweep = 0; sweep < 3; sweep += 1) {
    for (let index = 0; index < frequencies.length; index += 1) {
      const lower = Math.max(0.5 / (tau.at(-1) || 1), frequencies[index] - span);
      const upper = Math.min(nyquist * 0.999, frequencies[index] + span);
      frequencies[index] = goldenMinimum(
        (candidate) => {
          const trial = [...frequencies];
          trial[index] = candidate;
          try {
            return fitAtFrequencies(tau, values, trial).rss;
          } catch {
            return Number.POSITIVE_INFINITY;
          }
        },
        lower,
        upper,
      );
    }
  }
  return frequencies;
}

function sortComponents(frequencies, coefficients) {
  const components = frequencies.map((frequency, index) => ({
    frequency,
    cosine: coefficients[1 + 2 * index],
    sine: coefficients[2 + 2 * index],
  }));
  components.sort((a, b) => a.frequency - b.frequency);
  return components;
}

function fitCandidate(values, tau, sampleRate, initialFrequencies, count, spectrum) {
  const nyquist = sampleRate / 2;
  const span = spectrum.binWidth * 2;
  const frequencies = optimizeFrequencies(tau, values, initialFrequencies, nyquist, span);
  const solved = fitAtFrequencies(tau, values, frequencies);
  const components = sortComponents(frequencies, solved.coefficients);
  const n = values.length;
  const freeParameters = 1 + 3 * count;
  const rss = Math.max(solved.rss, 1e-30);
  const baseline = mean(values);
  const sst = values.reduce((sum, value) => sum + (value - baseline) ** 2, 0);
  const r2 = sst > 0 ? 1 - solved.rss / sst : null;
  const aic = n * Math.log(rss / n) + 2 * freeParameters;
  const bic = n * Math.log(rss / n) + freeParameters * Math.log(n);
  const residual = values.map((value, index) => value - solved.fitted[index]);
  const residualSpectrum = computeSpectrum(residual, sampleRate);
  const strongestResidual = residualSpectrum.peaks[0] ?? null;
  const lag1 = autocorrelation(residual, 1);
  const parameters = [
    { id: "offset", label: "直流偏移", value: solved.coefficients[0], unit: "a.u." },
  ];
  components.forEach((component, index) => {
    const amplitude = Math.hypot(component.cosine, component.sine);
    const phase = Math.atan2(component.cosine, component.sine);
    parameters.push(
      {
        id: `frequency_${index + 1}`,
        label: count === 1 ? "频率" : `频率 ${index + 1}`,
        value: component.frequency,
        unit: "Hz",
      },
      {
        id: `amplitude_${index + 1}`,
        label: count === 1 ? "幅值" : `幅值 ${index + 1}`,
        value: amplitude,
        unit: "a.u.",
      },
      {
        id: `phase_${index + 1}`,
        label: count === 1 ? "相位" : `相位 ${index + 1}`,
        value: phase,
        unit: "rad",
        reference: "相对首样本",
      },
    );
  });
  return {
    id: count === 1 ? "single_tone" : `multi_tone_${count}`,
    label: count === 1 ? "单频模型" : `${count} 频模型`,
    count,
    frequencies: components.map((component) => component.frequency),
    parameters,
    fitted: solved.fitted,
    residual,
    metrics: {
      rss: solved.rss,
      rmse: Math.sqrt(solved.rss / n),
      r2,
      aic,
      bic,
      sampleCount: n,
      freeParameters,
    },
    residualAnalysis: {
      rms: rms(residual),
      lag1,
      maxAcf: maxAbsAutocorrelation(residual),
      strongestPeak: strongestResidual,
      prominence: strongestResidual?.prominence ?? 0,
      frequency: strongestResidual?.frequency ?? null,
    },
  };
}

export function autocorrelation(values, lag) {
  const n = values.length;
  if (lag >= n) return 0;
  const center = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) denominator += (values[i] - center) ** 2;
  for (let i = 0; i < n - lag; i += 1) numerator += (values[i] - center) * (values[i + lag] - center);
  return denominator > 0 ? numerator / denominator : 0;
}

function maxAbsAutocorrelation(values) {
  const maxLag = Math.min(100, Math.floor(values.length / 4));
  let maximum = 0;
  for (let lag = 1; lag <= maxLag; lag += 1) {
    maximum = Math.max(maximum, Math.abs(autocorrelation(values, lag)));
  }
  return maximum;
}

export function validateSignal(time, values) {
  if (time.length !== values.length) throw new Error("时间和信号的样本数不一致。");
  if (values.length < 64) throw new Error("至少需要 64 个样本。");
  if (values.length > 500000) throw new Error("首版最多分析 500,000 个样本。");
  if (!time.every(Number.isFinite) || !values.every(Number.isFinite)) {
    throw new Error("数据中存在 NaN 或 Infinity。");
  }
  let diffs = [];
  for (let i = 1; i < time.length; i += 1) diffs.push(time[i] - time[i - 1]);
  if (diffs.some((diff) => diff <= 0)) throw new Error("时间列必须严格递增。");
  diffs.sort((a, b) => a - b);
  const dt = diffs[Math.floor(diffs.length / 2)];
  const jitter = Math.max(...diffs.map((diff) => Math.abs(diff - dt))) / dt;
  if (jitter > 0.05) throw new Error("首版仅支持近似均匀采样，时间抖动需不超过 5%。");
  return { dt, sampleRate: 1 / dt, duration: time.at(-1) - time[0] };
}

export function analyzeSignal(time, values) {
  const { sampleRate, duration } = validateSignal(time, values);
  const tau = time.map((value) => value - time[0]);
  const spectrum = computeSpectrum(values, sampleRate);
  const chosenPeaks = [];
  for (const peak of spectrum.peaks) {
    if (chosenPeaks.every((other) => Math.abs(other.frequency - peak.frequency) > spectrum.binWidth * 1.5)) {
      chosenPeaks.push(peak);
    }
    if (chosenPeaks.length === 3) break;
  }
  const candidates = [];
  if (chosenPeaks.length) {
    try {
      candidates.push(fitCandidate(values, tau, sampleRate, [chosenPeaks[0].frequency], 1, spectrum));
    } catch {}
    for (let count = 2; count <= chosenPeaks.length; count += 1) {
      try {
        candidates.push(
          fitCandidate(
            values,
            tau,
            sampleRate,
            chosenPeaks.slice(0, count).map((peak) => peak.frequency),
            count,
            spectrum,
          ),
        );
      } catch {}
    }
  }
  candidates.sort((a, b) => a.metrics.bic - b.metrics.bic);
  let best = candidates[0] ?? null;
  if (best?.count > 1) {
    const single = candidates.find((candidate) => candidate.count === 1);
    const rssReduction = single ? 1 - best.metrics.rss / Math.max(single.metrics.rss, 1e-30) : 0;
    if (!single || best.metrics.bic > single.metrics.bic - 10 || rssReduction < 0.1) best = single;
  }
  const maxProminence = spectrum.peaks[0]?.prominence ?? 0;
  const signalRms = rms(values.map((value) => value - mean(values)));
  const unknown = !best || maxProminence < 6 || best.metrics.r2 === null || best.metrics.r2 < 0.5;
  const topPeak = spectrum.peaks[0] ?? null;
  const cycles = best ? best.frequencies[0] * duration : 0;
  const residualAcf = best?.residualAnalysis.maxAcf ?? 1;
  const residualProminence = best?.residualAnalysis.prominence ?? 0;
  const residualRms = best?.residualAnalysis.rms ?? signalRms;
  const residualRelative = signalRms > 0 ? residualRms / signalRms : 1;
  const evidence = [
    {
      id: "spectral_prominence",
      label: "主谱峰显著度",
      value: `${maxProminence.toFixed(1)}× 中位数`,
      detail: topPeak ? `${topPeak.frequency.toFixed(3)} Hz` : "未发现显著谱峰",
      status: maxProminence >= 8 ? "pass" : maxProminence >= 6 ? "warn" : "fail",
    },
    {
      id: "fit_quality",
      label: "拟合解释能力",
      value: best?.metrics.r2 == null ? "不可计算" : `R² ${best.metrics.r2.toFixed(4)}`,
      detail: best ? `RMSE ${best.metrics.rmse.toFixed(4)} a.u.` : "无有效候选",
      status: best && best.metrics.r2 >= 0.98 ? "pass" : best && best.metrics.r2 >= 0.85 ? "warn" : "fail",
    },
    {
      id: "residual_whiteness",
      label: "残差自相关",
      value: residualAcf.toFixed(3),
      detail: "最大绝对 ACF（滞后 1–100）",
      status: residualAcf <= 0.2 ? "pass" : residualAcf <= 0.35 ? "warn" : "fail",
    },
    {
      id: "residual_structure",
      label: "残余谱结构",
      value: `${residualProminence.toFixed(1)}× 中位数`,
      detail: best?.residualAnalysis.frequency
        ? `残余主频 ${best.residualAnalysis.frequency.toFixed(3)} Hz`
        : "无明显残余主频",
      status: residualProminence <= 8 || residualRelative <= 0.01 ? "pass" : residualProminence <= 14 ? "warn" : "fail",
    },
    {
      id: "frequency_resolution",
      label: "观测频率分辨率",
      value: `±${(1 / duration).toFixed(4)} Hz`,
      detail: `观测时长 ${duration.toFixed(4)} s；${cycles.toFixed(1)} 个基频周期`,
      status: cycles >= 5 ? "pass" : cycles >= 2 ? "warn" : "fail",
    },
  ];
  let level = "reliable";
  let levelLabel = "较高可信";
  if (unknown) {
    level = "insufficient_evidence";
    levelLabel = "证据不足 / 未知信号";
  } else if (evidence.some((item) => item.status === "fail")) {
    level = "unreliable";
    levelLabel = "不可靠";
  } else if (evidence.some((item) => item.status === "warn")) {
    level = "caution";
    levelLabel = "需要谨慎";
  }
  const sortedCandidates = [...candidates].sort((a, b) => a.metrics.bic - b.metrics.bic);
  const runnerUp = sortedCandidates.find((candidate) => candidate !== best);
  const bicGap = runnerUp && best ? runnerUp.metrics.bic - best.metrics.bic : null;
  const limitations = [
    "候选模型仅包含单频与多频正弦模型，不代表物理模型唯一正确。",
    "可信等级是确定性证据汇总，不是统计概率。",
    "CSV 首版仅分析单通道、近似均匀采样的实数信号。",
  ];
  if (unknown) limitations.unshift("当前数据未提供足够证据支持任何候选模型。");
  if (bicGap !== null && bicGap < 10) limitations.push("最优与次优候选的 BIC 差距小于 10，模型区分度有限。");
  const nextSteps = unknown
    ? ["检查是否遗漏实验背景或采样单位。", "提高采样率或延长观测时长后重试。", "扩展模型库以覆盖调幅、调频或非平稳信号。"]
    : ["用不同信噪比数据复核参数稳定性。", "检查残差是否符合测量噪声假设。", "若已知物理模型，加入模型约束后再比较。"];
  return {
    createdAt: new Date().toISOString(),
    sampleCount: values.length,
    sampleRate,
    duration,
    nyquist: sampleRate / 2,
    spectrum,
    candidates: sortedCandidates,
    best,
    unknown,
    recommendedId: unknown ? null : best?.id ?? null,
    reliability: { level, label: levelLabel, evidence, limitations, nextSteps, bicGap },
    series: {
      time,
      observed: values,
      fitted: best?.fitted ?? values.map(() => 0),
      residual: best?.residual ?? values.map((value) => value - mean(values)),
    },
  };
}

export function templateExplanation(result) {
  if (result.unknown) {
    return {
      summary: "当前数据没有形成足够稳定的候选模型，因此系统拒绝强行给出参数结论。",
      observations: result.reliability.evidence.map((item) => `${item.label}：${item.value}`),
      limitations: result.reliability.limitations,
      nextSteps: result.reliability.nextSteps,
    };
  }
  const best = result.best;
  const frequency = best.parameters.find((parameter) => parameter.id === "frequency_1")?.value;
  const amplitude = best.parameters.find((parameter) => parameter.id === "amplitude_1")?.value;
  return {
    summary: `推荐${best.label}。主频约 ${frequency.toFixed(4)} Hz，主幅值约 ${amplitude.toFixed(4)} a.u.，R² 为 ${best.metrics.r2.toFixed(4)}。`,
    observations: result.reliability.evidence.map((item) => `${item.label}：${item.value}；${item.detail}`),
    limitations: result.reliability.limitations,
    nextSteps: result.reliability.nextSteps,
  };
}

export function buildAiPayload(result) {
  return {
    unknown: result.unknown,
    recommendedModel: result.unknown ? null : (result.best?.label ?? null),
    sampleCount: result.sampleCount,
    sampleRate: result.sampleRate,
    duration: result.duration,
    candidates: result.candidates.map((candidate) => ({
      model: candidate.label,
      r2: candidate.metrics.r2,
      rmse: candidate.metrics.rmse,
      bic: candidate.metrics.bic,
      parameters: candidate.parameters.map((parameter) => ({
        name: parameter.label,
        value: parameter.value,
        unit: parameter.unit,
      })),
    })),
    reliability: {
      level: result.reliability.level,
      evidence: result.reliability.evidence.map((item) => ({
        label: item.label,
        value: item.value,
        detail: item.detail,
        status: item.status,
      })),
      limitations: result.reliability.limitations,
    },
  };
}
