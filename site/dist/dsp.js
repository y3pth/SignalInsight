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
  return { coefficients, fitted, rss, normal };
}

function residualStatistics(residual, sampleRate) {
  const residualSpectrum = computeSpectrum(residual, sampleRate);
  const strongestResidual = residualSpectrum.peaks[0] ?? null;
  return {
    rms: rms(residual),
    lag1: autocorrelation(residual, 1),
    maxAcf: maxAbsAutocorrelation(residual),
    strongestPeak: strongestResidual,
    prominence: strongestResidual?.prominence ?? 0,
    frequency: strongestResidual?.frequency ?? null,
  };
}

function evaluateCandidate(values, fitted, freeParameters, sampleRate) {
  const n = values.length;
  const residual = values.map((value, index) => value - fitted[index]);
  const rss = residual.reduce((sum, value) => sum + value * value, 0);
  const baseline = mean(values);
  const sst = values.reduce((sum, value) => sum + (value - baseline) ** 2, 0);
  const r2 = sst > 0 ? 1 - rss / sst : null;
  const rssLog = Math.max(rss, 1e-30);
  const aic = n * Math.log(rssLog / n) + 2 * freeParameters;
  const bic = n * Math.log(rssLog / n) + freeParameters * Math.log(n);
  return {
    residual,
    metrics: {
      rss,
      rmse: Math.sqrt(rss / n),
      r2,
      aic,
      bic,
      sampleCount: n,
      freeParameters,
    },
    residualAnalysis: residualStatistics(residual, sampleRate),
  };
}

function inverseFft(re, im) {
  const n = re.length;
  for (let i = 0; i < n; i += 1) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < n; i += 1) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
}

function analyticSignal(values) {
  const n = values.length;
  const nfft = nextPowerOfTwo(n);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const center = mean(values);
  for (let i = 0; i < n; i += 1) re[i] = values[i] - center;
  fft(re, im);
  const half = nfft / 2;
  for (let k = 1; k < half; k += 1) {
    re[k] *= 2;
    im[k] *= 2;
  }
  for (let k = half + 1; k < nfft; k += 1) {
    re[k] = 0;
    im[k] = 0;
  }
  inverseFft(re, im);
  const envelope = new Array(n);
  const phase = new Array(n);
  let previous = 0;
  let unwrapped = 0;
  for (let i = 0; i < n; i += 1) {
    envelope[i] = Math.hypot(re[i], im[i]);
    const current = Math.atan2(im[i], re[i]);
    if (i === 0) {
      unwrapped = current;
    } else {
      let delta = current - previous;
      while (delta > Math.PI) delta -= TAU;
      while (delta < -Math.PI) delta += TAU;
      unwrapped += delta;
    }
    phase[i] = unwrapped;
    previous = current;
  }
  return { envelope, phase };
}

function fitThreeBasis(values, first, second) {
  const n = values.length;
  let s11 = 0;
  let s12 = 0;
  let s22 = 0;
  let s1 = 0;
  let s2 = 0;
  let sy = 0;
  let s1y = 0;
  let s2y = 0;
  for (let i = 0; i < n; i += 1) {
    const x1 = first[i];
    const x2 = second[i];
    const y = values[i];
    s11 += x1 * x1;
    s12 += x1 * x2;
    s22 += x2 * x2;
    s1 += x1;
    s2 += x2;
    sy += y;
    s1y += x1 * y;
    s2y += x2 * y;
  }
  const normal = [
    [n, s1, s2],
    [s1, s11, s12],
    [s2, s12, s22],
  ];
  const coefficients = solveLinear(normal.map((row) => [...row]), [sy, s1y, s2y]);
  const fitted = new Array(n);
  let rss = 0;
  for (let i = 0; i < n; i += 1) {
    const prediction = coefficients[0] + coefficients[1] * first[i] + coefficients[2] * second[i];
    fitted[i] = prediction;
    rss += (values[i] - prediction) ** 2;
  }
  return { coefficients, fitted, rss, normal };
}

function downsampleArrays(arrays, maxPoints = 8192) {
  const length = arrays[0]?.length ?? 0;
  const step = Math.max(1, Math.ceil(length / maxPoints));
  const indices = [];
  for (let i = 0; i < length; i += step) indices.push(i);
  if (indices.at(-1) !== length - 1) indices.push(length - 1);
  return arrays.map((array) => indices.map((index) => array[index]));
}

function instantaneousFrequency(phase, tau, sampleRate) {
  const dt = 1 / sampleRate;
  const start = Math.max(1, Math.floor(phase.length * 0.05));
  const end = Math.min(phase.length - 1, Math.ceil(phase.length * 0.95));
  const time = [];
  const values = [];
  for (let i = start; i < end; i += 1) {
    time.push(tau[i]);
    values.push((phase[i + 1] - phase[i]) / (TAU * dt));
  }
  return { time, values, mean: values.length ? mean(values) : 0 };
}

function fitAmCandidate(values, tau, sampleRate, spectrum, analytic, inst, duration) {
  const n = values.length;
  const envelope = analytic.envelope;
  const envelopeSpectrum = computeSpectrum(envelope, sampleRate);
  const minModulation = Math.max(1 / duration, spectrum.binWidth * 0.75);
  const carrierGuess = Number.isFinite(inst.mean) && inst.mean > 0 ? inst.mean : spectrum.peaks[0]?.frequency;
  if (!carrierGuess) return null;
  const modulationPeak = envelopeSpectrum.peaks.find(
    (peak) => peak.frequency >= minModulation && peak.frequency < carrierGuess * 0.9 && peak.prominence >= 4,
  );
  if (!modulationPeak) return null;

  const fcFloor = Math.max(spectrum.binWidth, carrierGuess * 0.98);
  const fcCeil = Math.min(sampleRate / 2 * 0.999, carrierGuess * 1.02);
  const fmFloor = Math.max(minModulation, modulationPeak.frequency - spectrum.binWidth * 2);
  const fmCeil = Math.min(carrierGuess * 0.9, modulationPeak.frequency + spectrum.binWidth * 2);
  if (fcCeil <= fcFloor || fmCeil <= fmFloor) return null;

  const [tauS, valuesS, envelopeS] = downsampleArrays([tau, values, envelope], 8192);
  const amAt = (fc, fm) => {
    try {
      const envFit = fitAtFrequencies(tauS, envelopeS, [fm]);
      const a0 = envFit.coefficients[0];
      const a = envFit.coefficients[1];
      const b = envFit.coefficients[2];
      if (!Number.isFinite(a0) || a0 <= 0) return null;
      const first = new Array(tauS.length);
      const second = new Array(tauS.length);
      for (let i = 0; i < tauS.length; i += 1) {
        const modulation = a * Math.cos(TAU * fm * tauS[i]) + b * Math.sin(TAU * fm * tauS[i]);
        const env = a0 + modulation;
        first[i] = env * Math.cos(TAU * fc * tauS[i]);
        second[i] = env * Math.sin(TAU * fc * tauS[i]);
      }
      return fitThreeBasis(valuesS, first, second);
    } catch {
      return null;
    }
  };

  let fc = Math.min(fcCeil, Math.max(fcFloor, carrierGuess));
  let fm = Math.min(fmCeil, Math.max(fmFloor, modulationPeak.frequency));
  for (let sweep = 0; sweep < 2; sweep += 1) {
    fm = goldenMinimum((candidate) => amAt(fc, candidate)?.rss ?? Number.POSITIVE_INFINITY, fmFloor, fmCeil, 32);
    fc = goldenMinimum((candidate) => amAt(candidate, fm)?.rss ?? Number.POSITIVE_INFINITY, fcFloor, fcCeil, 32);
  }

  const envFit = fitAtFrequencies(tau, envelope, [fm]);
  const a0 = envFit.coefficients[0];
  const a = envFit.coefficients[1];
  const b = envFit.coefficients[2];
  if (!Number.isFinite(a0) || a0 <= 0) return null;
  const first = new Array(n);
  const second = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const modulation = a * Math.cos(TAU * fm * tau[i]) + b * Math.sin(TAU * fm * tau[i]);
    const env = a0 + modulation;
    first[i] = env * Math.cos(TAU * fc * tau[i]);
    second[i] = env * Math.sin(TAU * fc * tau[i]);
  }
  const fit = fitThreeBasis(values, first, second);
  const modulationIndex = Math.hypot(a, b) / a0;
  const evaluated = evaluateCandidate(values, fit.fitted, 7, sampleRate);
  const edgeTrim = Math.max(1, Math.floor(n * 0.05));
  const trimmedAnalysis = residualStatistics(evaluated.residual.slice(edgeTrim, n - edgeTrim), sampleRate);
  const u = fit.coefficients[1];
  const v = fit.coefficients[2];
  const carrierAmplitude = a0 * Math.hypot(u, v);
  let signalCov = null;
  try {
    signalCov = {
      variance: evaluated.metrics.rss / Math.max(1, n - 7),
      inverse: inverseMatrix(fit.normal),
    };
  } catch {}
  let envCov = null;
  try {
    envCov = {
      variance: envFit.rss / Math.max(1, n - 3),
      inverse: inverseMatrix(envFit.normal),
    };
  } catch {}
  const carrierCov = signalCov ? coefficientCovariance(signalCov.inverse, signalCov.variance, 1, 2) : null;
  const carrierSigmas = carrierCov ? amplitudePhaseSigma(u, v, carrierCov) : {};
  const modulationCov = envCov ? coefficientCovariance(envCov.inverse, envCov.variance, 1, 2) : null;
  const modulationSigmas = modulationCov ? amplitudePhaseSigma(a, b, modulationCov) : {};
  const resolution = 1 / Math.max(tau.at(-1) || 1, 1e-12);
  const viewStep = Math.max(1, Math.ceil(n / 512));
  const viewIndices = [];
  for (let index = 0; index < n; index += viewStep) viewIndices.push(index);
  if (viewIndices.at(-1) !== n - 1) viewIndices.push(n - 1);
  const modulationView = {
    type: "am",
    time: viewIndices.map((index) => tau[index]),
    primary: viewIndices.map((index) => envelope[index]),
    fitted: viewIndices.map((index) => envFit.fitted[index]),
    carrierFrequency: fc,
    modulationFrequency: fm,
    modulationIndex,
    carrierAmplitude,
    sidebands: [
      { frequency: fc - fm, amplitude: carrierAmplitude * modulationIndex / 2 },
      { frequency: fc, amplitude: carrierAmplitude },
      { frequency: fc + fm, amplitude: carrierAmplitude * modulationIndex / 2 },
    ],
  };
  return {
    id: "am",
    family: "am",
    label: "AM 调幅模型",
    count: 1,
    frequencies: [fc],
    parameters: [
      {
        id: "offset",
        label: "直流偏移",
        value: fit.coefficients[0],
        unit: "a.u.",
        sigma: signalCov ? Math.sqrt(Math.max(0, signalCov.variance * signalCov.inverse[0][0])) : undefined,
      },
      { id: "frequency_1", label: "载频", value: fc, unit: "Hz", sigma: resolution, sigmaKind: "resolution" },
      {
        id: "amplitude_1",
        label: "载波幅值",
        value: carrierAmplitude,
        unit: "a.u.",
        sigma: carrierSigmas.sigmaAmplitude == null ? undefined : a0 * carrierSigmas.sigmaAmplitude,
      },
      {
        id: "phase_1",
        label: "载波相位",
        value: Math.atan2(u, v),
        unit: "rad",
        reference: "相对首样本",
        sigma: carrierSigmas.sigmaPhase,
      },
      { id: "modulation_frequency", label: "调制频率", value: fm, unit: "Hz", sigma: resolution, sigmaKind: "resolution" },
      {
        id: "modulation_index",
        label: "调制指数",
        value: modulationIndex,
        unit: "",
        sigma: modulationIndexSigma(envCov, a0, a, b),
      },
      {
        id: "modulation_phase",
        label: "调制相位",
        value: Math.atan2(a, b),
        unit: "rad",
        reference: "相对首样本",
        sigma: modulationSigmas.sigmaPhase,
      },
    ],
    fitted: fit.fitted,
    residual: evaluated.residual,
    metrics: evaluated.metrics,
    residualAnalysis: trimmedAnalysis,
    modulationView,
    modulationEvidence: {
      frequency: fm,
      index: modulationIndex,
      prominence: modulationPeak.prominence,
      carrierFrequency: fc,
    },
  };
}

function fmModelFit(fc, fm, deviation, modulationPhase, tauX, valuesX) {
  const beta = deviation / fm;
  const cosPhase = new Array(tauX.length);
  const sinPhase = new Array(tauX.length);
  for (let i = 0; i < tauX.length; i += 1) {
    const phase = TAU * fc * tauX[i] + beta * Math.sin(TAU * fm * tauX[i] + modulationPhase);
    cosPhase[i] = Math.cos(phase);
    sinPhase[i] = Math.sin(phase);
  }
  return fitThreeBasis(valuesX, cosPhase, sinPhase);
}

function fitFmCandidate(values, tau, sampleRate, spectrum, inst, duration) {
  const n = values.length;
  const carrierGuess = Number.isFinite(inst.mean) && inst.mean > 0 ? inst.mean : spectrum.peaks[0]?.frequency;
  if (!carrierGuess) return null;
  const instSpectrum = computeSpectrum(inst.values, sampleRate);
  const minModulation = Math.max(1 / duration, spectrum.binWidth * 0.75);
  const modulationPeak = instSpectrum.peaks.find(
    (peak) => peak.frequency >= minModulation && peak.frequency < carrierGuess * 0.9 && peak.prominence >= 4,
  );
  if (!modulationPeak) return null;

  const fmFloor = Math.max(minModulation, modulationPeak.frequency - spectrum.binWidth * 2);
  const fmCeil = Math.min(carrierGuess * 0.9, modulationPeak.frequency + spectrum.binWidth * 2);
  if (fmCeil <= fmFloor) return null;

  const fm = Math.min(fmCeil, Math.max(fmFloor, modulationPeak.frequency));
  const fInstFit = fitAtFrequencies(inst.time, inst.values, [fm]);
  const fc = fInstFit.coefficients[0];
  const modulationCos = fInstFit.coefficients[1];
  const modulationSin = fInstFit.coefficients[2];
  const deviation = Math.hypot(modulationCos, modulationSin);
  const modulationPhase = Math.atan2(-modulationSin, modulationCos);
  if (!Number.isFinite(fc) || !Number.isFinite(deviation) || deviation <= 0 || fm <= 0) return null;
  const [tauS, valuesS] = downsampleArrays([tau, values], 8192);
  const fcSpan = Math.max(spectrum.binWidth, 0.5);
  const fcLower = Math.max(spectrum.binWidth, fc - fcSpan);
  const fcUpper = Math.min(sampleRate / 2 * 0.999, fc + fcSpan);
  const evaluateFm = (fcCandidate, deviationCandidate, phaseCandidate) => {
    try {
      return fmModelFit(fcCandidate, fm, deviationCandidate, phaseCandidate, tauS, valuesS).rss;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  let fcFinal = fc;
  let deviationFinal = deviation;
  let modulationPhaseFinal = modulationPhase;
  for (let sweep = 0; sweep < 2; sweep += 1) {
    fcFinal = goldenMinimum(
      (candidate) => evaluateFm(candidate, deviationFinal, modulationPhaseFinal),
      fcLower,
      fcUpper,
      32,
    );
    deviationFinal = goldenMinimum(
      (candidate) => evaluateFm(fcFinal, candidate, modulationPhaseFinal),
      Math.max(1e-6, deviation * 0.9),
      deviation * 1.1,
      32,
    );
    modulationPhaseFinal = goldenMinimum(
      (candidate) => evaluateFm(fcFinal, deviationFinal, candidate),
      modulationPhase - 0.6,
      modulationPhase + 0.6,
      32,
    );
  }
  if (!Number.isFinite(fcFinal)) fcFinal = fc;
  if (!Number.isFinite(deviationFinal)) deviationFinal = deviation;
  if (!Number.isFinite(modulationPhaseFinal)) modulationPhaseFinal = modulationPhase;
  const beta = deviationFinal / fm;
  const cosPhase = new Array(n);
  const sinPhase = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const phase = TAU * fcFinal * tau[i] + beta * Math.sin(TAU * fm * tau[i] + modulationPhaseFinal);
    cosPhase[i] = Math.cos(phase);
    sinPhase[i] = Math.sin(phase);
  }
  const fit = fitThreeBasis(values, cosPhase, sinPhase);
  const evaluated = evaluateCandidate(values, fit.fitted, 7, sampleRate);
  const edgeTrim = Math.max(1, Math.floor(n * 0.05));
  const trimmedAnalysis = residualStatistics(evaluated.residual.slice(edgeTrim, n - edgeTrim), sampleRate);
  const u = fit.coefficients[1];
  const v = fit.coefficients[2];
  let signalCov = null;
  try {
    signalCov = {
      variance: evaluated.metrics.rss / Math.max(1, n - 7),
      inverse: inverseMatrix(fit.normal),
    };
  } catch {}
  let fInstCov = null;
  try {
    fInstCov = {
      variance: fInstFit.rss / Math.max(1, inst.time.length - 3),
      inverse: inverseMatrix(fInstFit.normal),
    };
  } catch {}
  const carrierCov = signalCov ? coefficientCovariance(signalCov.inverse, signalCov.variance, 1, 2) : null;
  const carrierSigmas = carrierCov ? amplitudePhaseSigma(u, v, carrierCov) : {};
  const fInstCoeffCov = fInstCov ? coefficientCovariance(fInstCov.inverse, fInstCov.variance, 1, 2) : null;
  const fInstSigmas = fInstCoeffCov ? amplitudePhaseSigma(modulationCos, modulationSin, fInstCoeffCov) : {};
  const resolution = 1 / Math.max(tau.at(-1) || 1, 1e-12);
  const deviationSigma = Math.max(fInstSigmas.sigmaAmplitude ?? 0, resolution);
  const viewStep = Math.max(1, Math.ceil(inst.time.length / 512));
  const viewIndices = [];
  for (let index = 0; index < inst.time.length; index += viewStep) viewIndices.push(index);
  if (viewIndices.at(-1) !== inst.time.length - 1) viewIndices.push(inst.time.length - 1);
  const sidebandTolerance = Math.max(spectrum.binWidth * 1.5, fm * 0.2);
  const sidebands = [fcFinal - 2 * fm, fcFinal - fm, fcFinal, fcFinal + fm, fcFinal + 2 * fm].map((frequency) => {
    const peak = spectrum.peaks.find((item) => Math.abs(item.frequency - frequency) <= sidebandTolerance);
    return { frequency, amplitude: peak?.amplitude ?? 0 };
  });
  const modulationView = {
    type: "fm",
    time: viewIndices.map((index) => inst.time[index]),
    primary: viewIndices.map((index) => inst.values[index]),
    fitted: viewIndices.map((index) => fInstFit.fitted[index]),
    carrierFrequency: fcFinal,
    modulationFrequency: fm,
    frequencyDeviation: deviationFinal,
    modulationIndex: beta,
    sidebands,
  };
  return {
    id: "fm",
    family: "fm",
    label: "FM 调频模型",
    count: 1,
    frequencies: [fc],
    parameters: [
      {
        id: "offset",
        label: "直流偏移",
        value: fit.coefficients[0],
        unit: "a.u.",
        sigma: signalCov ? Math.sqrt(Math.max(0, signalCov.variance * signalCov.inverse[0][0])) : undefined,
      },
      { id: "frequency_1", label: "载频", value: fcFinal, unit: "Hz", sigma: resolution, sigmaKind: "resolution" },
      {
        id: "amplitude_1",
        label: "载波幅值",
        value: Math.hypot(u, v),
        unit: "a.u.",
        sigma: carrierSigmas.sigmaAmplitude,
      },
      {
        id: "phase_1",
        label: "载波相位",
        value: Math.atan2(u, v),
        unit: "rad",
        reference: "相对首样本",
        sigma: carrierSigmas.sigmaPhase,
      },
      { id: "modulation_frequency", label: "调制频率", value: fm, unit: "Hz", sigma: resolution, sigmaKind: "resolution" },
      {
        id: "frequency_deviation",
        label: "频偏",
        value: deviationFinal,
        unit: "Hz",
        sigma: deviationSigma,
      },
      {
        id: "modulation_index",
        label: "调制指数",
        value: beta,
        unit: "",
        sigma: deviationSigma / fm,
      },
      {
        id: "modulation_phase",
        label: "调制相位",
        value: modulationPhaseFinal,
        unit: "rad",
        reference: "相对首样本",
        sigma: Math.max(fInstSigmas.sigmaPhase ?? 0, 0.01),
      },
    ],
    fitted: fit.fitted,
    residual: evaluated.residual,
    metrics: evaluated.metrics,
    residualAnalysis: trimmedAnalysis,
    modulationView,
    modulationEvidence: {
      frequency: fm,
      index: beta,
      prominence: modulationPeak.prominence,
      carrierFrequency: fcFinal,
    },
  };
}

function inverseMatrix(matrix) {
  const n = matrix.length;
  const inverse = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    const rhs = new Array(n).fill(0);
    rhs[i] = 1;
    const column = solveLinear(matrix.map((row) => [...row]), rhs);
    for (let j = 0; j < n; j += 1) inverse[j][i] = column[j];
  }
  return inverse;
}

function coefficientCovariance(inverse, variance, cosIndex, sinIndex) {
  return {
    varC: variance * inverse[cosIndex][cosIndex],
    varS: variance * inverse[sinIndex][sinIndex],
    cov: variance * inverse[cosIndex][sinIndex],
  };
}

function amplitudePhaseSigma(cosValue, sinValue, covariance) {
  const amplitude = Math.hypot(cosValue, sinValue);
  if (!amplitude) return {};
  const sigmaAmplitude = Math.sqrt(Math.max(0,
    (cosValue ** 2 * covariance.varC + sinValue ** 2 * covariance.varS + 2 * cosValue * sinValue * covariance.cov) / amplitude ** 2,
  ));
  const sigmaPhase = Math.sqrt(Math.max(0,
    (sinValue ** 2 * covariance.varC + cosValue ** 2 * covariance.varS - 2 * sinValue * cosValue * covariance.cov) / amplitude ** 4,
  ));
  return { sigmaAmplitude, sigmaPhase };
}

function modulationIndexSigma(envCovariance, a0, a, b) {
  const amplitude = Math.hypot(a, b);
  if (!a0 || !amplitude || !envCovariance) return undefined;
  const d0 = -amplitude / a0 ** 2;
  const da = a / (amplitude * a0);
  const db = b / (amplitude * a0);
  const { variance, inverse } = envCovariance;
  const value =
    d0 * d0 * variance * inverse[0][0] +
    da * da * variance * inverse[1][1] +
    db * db * variance * inverse[2][2] +
    2 * d0 * da * variance * inverse[0][1] +
    2 * d0 * db * variance * inverse[0][2] +
    2 * da * db * variance * inverse[1][2];
  return Math.sqrt(Math.max(0, value));
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

function optimizeFrequencies(tau, values, initialFrequencies, nyquist, span, sweeps = 3, iterations = 48) {
  let frequencies = [...initialFrequencies];
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
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
        iterations,
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
  const searchSize = 32768;
  const [tauSearch, valuesSearch] = downsampleArrays([tau, values], searchSize);
  let frequencies = optimizeFrequencies(
    tauSearch,
    valuesSearch,
    initialFrequencies,
    nyquist,
    span,
    tauSearch.length < tau.length ? 2 : 3,
    tauSearch.length < tau.length ? 32 : 48,
  );
  if (tauSearch.length < tau.length) {
    const refineSpan = Math.max(span, (sampleRate / searchSize) * 2);
    frequencies = optimizeFrequencies(
      tau,
      values,
      frequencies,
      nyquist,
      refineSpan,
      1,
      count === 1 ? 24 : 8,
    );
  }
  const solved = fitAtFrequencies(tau, values, frequencies);
  const components = sortComponents(frequencies, solved.coefficients);
  const freeParameters = 1 + 3 * count;
  const evaluated = evaluateCandidate(values, solved.fitted, freeParameters, sampleRate);
  let variance = null;
  let inverse = null;
  try {
    variance = evaluated.metrics.rss / Math.max(1, values.length - freeParameters);
    inverse = inverseMatrix(solved.normal);
  } catch {}
  const resolution = 1 / Math.max(tau.at(-1) || 1, 1e-12);
  const offsetSigma = inverse ? Math.sqrt(Math.max(0, variance * inverse[0][0])) : undefined;
  const parameters = [
    { id: "offset", label: "直流偏移", value: solved.coefficients[0], unit: "a.u.", sigma: offsetSigma },
  ];
  components.forEach((component, index) => {
    const amplitude = Math.hypot(component.cosine, component.sine);
    const phase = Math.atan2(component.cosine, component.sine);
    const covariance = inverse
      ? coefficientCovariance(inverse, variance, 1 + 2 * index, 2 + 2 * index)
      : null;
    const sigmas = covariance ? amplitudePhaseSigma(component.cosine, component.sine, covariance) : {};
    parameters.push(
      {
        id: `frequency_${index + 1}`,
        label: count === 1 ? "频率" : `频率 ${index + 1}`,
        value: component.frequency,
        unit: "Hz",
        sigma: resolution,
        sigmaKind: "resolution",
      },
      {
        id: `amplitude_${index + 1}`,
        label: count === 1 ? "幅值" : `幅值 ${index + 1}`,
        value: amplitude,
        unit: "a.u.",
        sigma: sigmas.sigmaAmplitude,
      },
      {
        id: `phase_${index + 1}`,
        label: count === 1 ? "相位" : `相位 ${index + 1}`,
        value: phase,
        unit: "rad",
        reference: "相对首样本",
        sigma: sigmas.sigmaPhase,
      },
    );
  });
  return {
    id: count === 1 ? "single_tone" : `multi_tone_${count}`,
    family: "tone",
    label: count === 1 ? "单频模型" : `${count} 频模型`,
    count,
    frequencies: components.map((component) => component.frequency),
    parameters,
    fitted: solved.fitted,
    residual: evaluated.residual,
    metrics: evaluated.metrics,
    residualAnalysis: evaluated.residualAnalysis,
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
  let maxDeviation = 0;
  for (const diff of diffs) maxDeviation = Math.max(maxDeviation, Math.abs(diff - dt));
  const jitter = maxDeviation / dt;
  if (jitter > 0.05) throw new Error("首版仅支持近似均匀采样，时间抖动需不超过 5%。");
  return { dt, sampleRate: 1 / dt, duration: time.at(-1) - time[0] };
}

export function inspectData(time, values, sampleRate, duration, spectrum) {
  const n = values.length;
  const checks = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min;
  const tolerance = Math.max(range * 1e-9, 1e-12);
  let maxRun = 0;
  let minRun = 0;
  let currentMax = 0;
  let currentMin = 0;
  for (const value of values) {
    if (value >= max - tolerance) currentMax += 1;
    else currentMax = 0;
    if (value <= min + tolerance) currentMin += 1;
    else currentMin = 0;
    if (currentMax > maxRun) maxRun = currentMax;
    if (currentMin > minRun) minRun = currentMin;
  }
  const longestRun = Math.max(maxRun, minRun);
  checks.push({
    id: "clipping",
    label: "削顶/饱和",
    status: longestRun >= 3 ? "fail" : longestRun === 2 ? "warn" : "pass",
    detail: longestRun >= 2 ? `最长连续 ${longestRun} 个样本贴近极值` : "未发现明显削顶",
  });

  const baseline = mean(values);
  const centeredRms = rms(values.map((value) => value - baseline));
  const edge = Math.max(1, Math.floor(n * 0.1));
  const firstMean = mean(values.slice(0, edge));
  const lastMean = mean(values.slice(n - edge));
  const drift = centeredRms > 0 ? Math.abs(lastMean - firstMean) / centeredRms : 0;
  checks.push({
    id: "drift",
    label: "直流漂移",
    status: drift > 0.9 ? "fail" : drift > 0.5 ? "warn" : "pass",
    detail: drift > 0.5 ? `首尾均值差为信号 RMS 的 ${(drift * 100).toFixed(0)}%` : "首尾基线稳定",
  });

  const diffStep = Math.max(1, Math.floor(n / 20000));
  const diffs = [];
  let maxJump = 0;
  for (let index = 1; index < n; index += 1) {
    const jump = Math.abs(values[index] - values[index - 1]);
    if (jump > maxJump) maxJump = jump;
    if (index % diffStep === 0) diffs.push(jump);
  }
  const typicalJump = diffs.length ? median(diffs) : 0;
  const jumpRatio = typicalJump > 1e-12 ? maxJump / typicalJump : maxJump > 1e-9 ? 100 : 0;
  checks.push({
    id: "jump",
    label: "跳变/不连续",
    status: jumpRatio > 80 ? "fail" : jumpRatio > 25 ? "warn" : "pass",
    detail: jumpRatio > 25 ? `最大相邻跳变为典型值的 ${jumpRatio.toFixed(0)}×` : "未发现异常跳变",
  });

  const third = Math.max(1, Math.floor(n / 3));
  const segmentRms = [];
  for (let segment = 0; segment < 3; segment += 1) {
    const start = segment * third;
    const end = segment === 2 ? n : start + third;
    const segmentValues = values.slice(start, end);
    const segmentMean = mean(segmentValues);
    segmentRms.push(rms(segmentValues.map((value) => value - segmentMean)));
  }
  const meanSegmentRms = mean(segmentRms);
  const rmsVariation = meanSegmentRms > 0
    ? (Math.max(...segmentRms) - Math.min(...segmentRms)) / meanSegmentRms
    : 0;
  checks.push({
    id: "stationarity",
    label: "振幅平稳性",
    status: rmsVariation > 0.9 ? "fail" : rmsVariation > 0.5 ? "warn" : "pass",
    detail: rmsVariation > 0.5 ? `分段 RMS 变化 ${(rmsVariation * 100).toFixed(0)}%` : "分段能量稳定",
  });

  let equalAdjacent = 0;
  for (let index = 1; index < n; index += 1) {
    if (values[index] === values[index - 1]) equalAdjacent += 1;
  }
  const flatFraction = equalAdjacent / Math.max(1, n - 1);
  checks.push({
    id: "quantization",
    label: "阶梯/量化",
    status: flatFraction > 0.5 ? "fail" : flatFraction > 0.25 ? "warn" : "pass",
    detail: flatFraction > 0.25
      ? `${(flatFraction * 100).toFixed(0)}% 相邻样本完全相同`
      : "未发现明显阶梯/量化",
  });

  const top = spectrum?.peaks?.[0];
  if (top) {
    const nyquistRatio = top.frequency / (sampleRate / 2);
    checks.push({
      id: "nyquist",
      label: "Nyquist 边界",
      status: nyquistRatio > 0.98 ? "fail" : nyquistRatio > 0.9 ? "warn" : "pass",
      detail: nyquistRatio > 0.9 ? `主峰位于 Nyquist 的 ${(nyquistRatio * 100).toFixed(0)}%` : "主峰远离 Nyquist",
    });
    checks.push({
      id: "cycles",
      label: "观测周期数",
      status: top.frequency * duration < 1 ? "fail" : top.frequency * duration < 3 ? "warn" : "pass",
      detail: top.frequency * duration < 3 ? `仅 ${(top.frequency * duration).toFixed(1)} 个周期` : `${(top.frequency * duration).toFixed(0)} 个周期`,
    });
  }

  const failures = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warn");
  return {
    status: failures.length ? "fail" : warnings.length ? "warn" : "ok",
    checks,
    limitations: failures.concat(warnings).slice(0, 3).map((check) => `${check.label}：${check.detail}`),
  };
}

export function analyzeSignal(time, values) {
  const { sampleRate, duration } = validateSignal(time, values);
  const tau = time.map((value) => value - time[0]);
  const spectrum = computeSpectrum(values, sampleRate);
  const health = inspectData(time, values, sampleRate, duration, spectrum);
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
  const baseline = mean(values);
  const sst = values.reduce((sum, value) => sum + (value - baseline) ** 2, 0);
  const numericalFloor = Math.max(sst * 1e-6, 1e-18);
  const toneCandidates = candidates.filter((candidate) => candidate.family === "tone");
  if (chosenPeaks.length >= 2 && chosenPeaks[0].prominence >= 6 && chosenPeaks[0].frequency * duration >= 5) {
    try {
      const analytic = analyticSignal(values);
      const inst = instantaneousFrequency(analytic.phase, tau, sampleRate);
      const am = fitAmCandidate(values, tau, sampleRate, spectrum, analytic, inst, duration);
      if (am) candidates.push(am);
      const fm = fitFmCandidate(values, tau, sampleRate, spectrum, inst, duration);
      if (fm) candidates.push(fm);
    } catch {}
  }
  candidates.sort((a, b) => a.metrics.bic - b.metrics.bic);
  const modulationCandidates = candidates.filter((candidate) => candidate.family !== "tone");
  const singleTone = toneCandidates.find((candidate) => candidate.id === "single_tone") ?? null;
  const twoTone = toneCandidates.find((candidate) => candidate.id === "multi_tone_2") ?? null;
  const threeTone = toneCandidates.find((candidate) => candidate.id === "multi_tone_3") ?? null;
  const improvesTone = (candidate, baseline) => {
    if (!candidate || !baseline) return false;
    const bothExact = candidate.metrics.rss <= numericalFloor && baseline.metrics.rss <= numericalFloor;
    if (bothExact) return false;
    const rssReduction = 1 - candidate.metrics.rss / Math.max(baseline.metrics.rss, 1e-30);
    return candidate.metrics.bic <= baseline.metrics.bic - 10 && rssReduction >= 0.1;
  };
  let bestTone = singleTone ?? twoTone ?? threeTone ?? null;
  if (bestTone === singleTone) {
    if (twoTone && improvesTone(twoTone, singleTone)) {
      bestTone = twoTone;
      if (threeTone && improvesTone(threeTone, twoTone)) bestTone = threeTone;
    }
  } else if (bestTone === twoTone && threeTone && improvesTone(threeTone, twoTone)) {
    bestTone = threeTone;
  }
  let best = bestTone;
  for (const candidate of modulationCandidates) {
    const evidence = candidate.modulationEvidence;
    const gate = evidence && evidence.index >= (candidate.family === "am" ? 0.08 : 0.1) && evidence.prominence >= 6;
    if (!gate) continue;
    if (!bestTone) {
      best = candidate;
    } else {
      const numericallyExact =
        candidate.metrics.rss <= numericalFloor && bestTone.metrics.rss <= numericalFloor;
      const rssReduction = 1 - candidate.metrics.rss / Math.max((singleTone ?? bestTone).metrics.rss, 1e-30);
      if (numericallyExact || (candidate.metrics.bic <= bestTone.metrics.bic && rssReduction >= 0.1)) {
        best = candidate;
      }
    }
    break;
  }
  const maxProminence = spectrum.peaks[0]?.prominence ?? 0;
  const signalRms = rms(values.map((value) => value - baseline));
  const unknown = !best || maxProminence < 6 || best.metrics.r2 === null || best.metrics.r2 < 0.5;
  const topPeak = spectrum.peaks[0] ?? null;
  const cycles = best ? best.frequencies[0] * duration : 0;
  const residualAcf = best?.residualAnalysis.maxAcf ?? 1;
  const residualProminence = best?.residualAnalysis.prominence ?? 0;
  const residualRms = best?.residualAnalysis.rms ?? signalRms;
  const residualRelative = signalRms > 0 ? residualRms / signalRms : 1;
  const highQuality = Boolean(
    best && best.metrics.r2 != null && best.metrics.r2 >= 0.999 && residualRelative <= 0.02,
  );
  const whitenessStatus = residualRelative <= 0.005
    ? "pass"
    : residualAcf <= 0.2 ? "pass" : residualAcf <= 0.35 ? "warn" : "fail";
  const structureStatus =
    residualProminence <= 8 || residualRelative <= 0.01
      ? "pass"
      : residualProminence <= 14 ? "warn" : "fail";
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
      detail: residualRelative <= 0.005
        ? `残差能量仅 ${(residualRelative * 100).toFixed(3)}% 信号；ACF 不具实际意义`
        : "最大绝对 ACF（滞后 1–100）",
      status: highQuality && whitenessStatus === "fail" ? "warn" : whitenessStatus,
    },
    {
      id: "residual_structure",
      label: "残余谱结构",
      value: `${residualProminence.toFixed(1)}× 中位数`,
      detail: best?.residualAnalysis.frequency
        ? `残余主频 ${best.residualAnalysis.frequency.toFixed(3)} Hz`
        : "无明显残余主频",
      status: highQuality && structureStatus === "fail" ? "warn" : structureStatus,
    },
    {
      id: "frequency_resolution",
      label: "观测频率分辨率",
      value: `±${(1 / duration).toFixed(4)} Hz`,
      detail: `观测时长 ${duration.toFixed(4)} s；${cycles.toFixed(1)} 个基频周期`,
      status: cycles >= 5 ? "pass" : cycles >= 2 ? "warn" : "fail",
    },
  ];
  const healthIssues = health.checks.filter((item) => item.status !== "pass");
  if (healthIssues.length) {
    evidence.push({
      id: "data_health",
      label: "数据体检",
      value: `${healthIssues.length} 项异常`,
      detail: healthIssues.map((item) => item.label).join("、"),
      status: health.status === "fail" ? "fail" : "warn",
    });
  }
  if (best?.family === "am" || best?.family === "fm") {
    const modulation = best.modulationEvidence;
    if (modulation) {
      evidence.push({
        id: "modulation_structure",
        label: "调制结构",
        value: `${best.family.toUpperCase()} · ${modulation.frequency.toFixed(3)} Hz · 指数 ${modulation.index.toFixed(3)}`,
        detail: `边带/瞬时频率显著度 ${modulation.prominence.toFixed(1)}×`,
        status: modulation.index >= (best.family === "am" ? 0.08 : 0.1) && modulation.prominence >= 6 ? "pass" : "warn",
      });
    }
  }
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
    "候选模型包含单频、多频正弦与 AM/FM 调制候选，不代表物理模型唯一正确。",
    "可信等级是确定性证据汇总，不是统计概率。",
    "参数不确定度为线性拟合近似；频率行标注 1/T 分辨率，不是严格置信区间。",
    "CSV 首版仅分析单通道、近似均匀采样的实数信号。",
  ];
  if (unknown) limitations.unshift("当前数据未提供足够证据支持任何候选模型。");
  if (bicGap !== null && bicGap < 10) limitations.push("最优与次优候选的 BIC 差距小于 10，模型区分度有限。");
  if (best?.family === "am" || best?.family === "fm") {
    limitations.push("AM/FM 结论来自包络与瞬时频率的整体拟合，不等价于物理调制机制。");
    limitations.push("AM/FM 的残差证据使用中间 90% 样本，以规避解析信号的边缘效应。");
  }
  if (best && residualRelative <= 0.005) {
    limitations.push("残差能量极低，ACF 与残余谱更适合视为数值或边缘效应，而非物理结构。");
  }
  if (highQuality && (whitenessStatus === "fail" || structureStatus === "fail")) {
    limitations.push("拟合极好但残差仍有结构，可信等级限制为需要谨慎，避免过度自信。");
  }
  limitations.push(...health.limitations);
  const nextSteps = unknown
    ? ["检查是否遗漏实验背景或采样单位。", "提高采样率或延长观测时长后重试。", "检查调制或非平稳证据是否不足。"]
    : ["用不同信噪比数据复核参数稳定性。", "检查残差是否符合测量噪声假设。", "若已知物理模型，加入模型约束后再比较。"];
  const fittedSeries = best?.fitted ?? values.map(() => 0);
  const residualSeries = best?.residual ?? values.map((value) => value - mean(values));
  const stripCandidate = ({ fitted, residual, ...summary }) => summary;
  return {
    kind: "real",
    createdAt: new Date().toISOString(),
    sampleCount: values.length,
    sampleRate,
    duration,
    nyquist: sampleRate / 2,
    spectrum,
    health,
    candidates: sortedCandidates.map(stripCandidate),
    best: best ? stripCandidate(best) : null,
    unknown,
    recommendedId: unknown ? null : best?.id ?? null,
    reliability: { level, label: levelLabel, evidence, limitations, nextSteps, bicGap },
    series: {
      time,
      observed: values,
      fitted: fittedSeries,
      residual: residualSeries,
    },
  };
}

function computeComplexSpectrum(iValues, qValues, sampleRate) {
  const n = iValues.length;
  const nfft = nextPowerOfTwo(n);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const meanI = mean(iValues);
  const meanQ = mean(qValues);
  let windowSum = 0;
  for (let index = 0; index < n; index += 1) {
    const window = 0.5 - 0.5 * Math.cos((TAU * index) / Math.max(1, n - 1));
    re[index] = (iValues[index] - meanI) * window;
    im[index] = (qValues[index] - meanQ) * window;
    windowSum += window;
  }
  fft(re, im);
  const frequencies = [];
  const amplitudes = [];
  const half = Math.floor(nfft / 2);
  for (let k = 1; k <= half; k += 1) {
    frequencies.push((k * sampleRate) / nfft);
    amplitudes.push(Math.hypot(re[k], im[k]) / Math.max(windowSum, 1));
  }
  const medianAmplitude = median(amplitudes);
  const peaks = [];
  for (let index = 1; index < amplitudes.length - 1; index += 1) {
    const amplitude = amplitudes[index];
    if (amplitude > amplitudes[index - 1] && amplitude >= amplitudes[index + 1]) {
      peaks.push({
        frequency: frequencies[index],
        amplitude,
        bin: index + 1,
        prominence: amplitude / Math.max(medianAmplitude, 1e-15),
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

function fitComplexAtFrequency(tau, iValues, qValues, frequency) {
  const n = tau.length;
  let sumCos = 0;
  let sumSin = 0;
  let sumI = 0;
  let sumQ = 0;
  let sumCosI = 0;
  let sumSinQ = 0;
  let sumSinI = 0;
  let sumCosQ = 0;
  const cosines = new Array(n);
  const sines = new Array(n);
  for (let index = 0; index < n; index += 1) {
    const cosine = Math.cos(TAU * frequency * tau[index]);
    const sine = Math.sin(TAU * frequency * tau[index]);
    cosines[index] = cosine;
    sines[index] = sine;
    sumCos += cosine;
    sumSin += sine;
    sumI += iValues[index];
    sumQ += qValues[index];
    sumCosI += cosine * iValues[index];
    sumSinQ += sine * qValues[index];
    sumSinI += sine * iValues[index];
    sumCosQ += cosine * qValues[index];
  }
  const normal = [
    [n, 0, sumCos, -sumSin],
    [0, n, sumSin, sumCos],
    [sumCos, sumSin, n, 0],
    [-sumSin, sumCos, 0, n],
  ];
  const rhs = [sumI, sumQ, sumCosI + sumSinQ, -sumSinI + sumCosQ];
  const coefficients = solveLinear(normal, rhs);
  const [cI, cQ, u, v] = coefficients;
  const fittedI = new Array(n);
  const fittedQ = new Array(n);
  const residualI = new Array(n);
  const residualQ = new Array(n);
  let rss = 0;
  for (let index = 0; index < n; index += 1) {
    const predictionI = cI + u * cosines[index] - v * sines[index];
    const predictionQ = cQ + u * sines[index] + v * cosines[index];
    fittedI[index] = predictionI;
    fittedQ[index] = predictionQ;
    residualI[index] = iValues[index] - predictionI;
    residualQ[index] = qValues[index] - predictionQ;
    rss += residualI[index] ** 2 + residualQ[index] ** 2;
  }
  return { coefficients, fittedI, fittedQ, residualI, residualQ, rss };
}

export function analyzeIqSignal(time, iValues, qValues) {
  if (iValues.length !== qValues.length || iValues.length !== time.length) {
    throw new Error("时间、I、Q 的样本数必须一致。");
  }
  const { sampleRate, duration } = validateSignal(time, iValues);
  if (!qValues.every(Number.isFinite)) throw new Error("Q 分量中存在 NaN 或 Infinity。");
  const tau = time.map((value) => value - time[0]);
  const spectrum = computeComplexSpectrum(iValues, qValues, sampleRate);
  const health = inspectData(time, iValues, sampleRate, duration, spectrum);
  const top = spectrum.peaks[0] ?? null;
  let frequency = top?.frequency ?? null;
  let fit = null;
  if (top) {
    const span = Math.max(spectrum.binWidth * 2, 0.5 / duration);
    const lower = Math.max(0.5 / duration, top.frequency - span);
    const upper = Math.min(sampleRate / 2 * 0.999, top.frequency + span);
    try {
      frequency = goldenMinimum((candidate) => {
        try {
          return fitComplexAtFrequency(tau, iValues, qValues, candidate).rss;
        } catch {
          return Number.POSITIVE_INFINITY;
        }
      }, lower, upper, 36);
    } catch {}
    fit = fitComplexAtFrequency(tau, iValues, qValues, frequency);
  }
  const n = iValues.length;
  const meanI = mean(iValues);
  const meanQ = mean(qValues);
  const sst = iValues.reduce((sum, value, index) => sum + (value - meanI) ** 2 + (qValues[index] - meanQ) ** 2, 0);
  const rss = fit?.rss ?? sst;
  const r2 = sst > 0 && fit ? 1 - rss / sst : null;
  const observations = 2 * n;
  const freeParameters = 5;
  const rssLog = Math.max(rss, 1e-30);
  const metrics = {
    rss,
    rmse: Math.sqrt(rss / Math.max(1, observations)),
    r2,
    aic: observations * Math.log(rssLog / observations) + 2 * freeParameters,
    bic: observations * Math.log(rssLog / observations) + freeParameters * Math.log(observations),
    sampleCount: n,
    freeParameters,
  };
  const residualI = fit?.residualI ?? iValues.map((value) => value - meanI);
  const residualAnalysis = residualStatistics(residualI, sampleRate);
  const residualRelative = Math.sqrt(rss / Math.max(sst, 1e-30));
  const residualNegligible = residualRelative <= 0.005;
  const highQuality = r2 != null && r2 >= 0.999 && residualRelative <= 0.02;
  const whitenessStatus = residualNegligible
    ? "pass"
    : residualAnalysis.maxAcf <= 0.2 ? "pass" : residualAnalysis.maxAcf <= 0.35 ? "warn" : "fail";
  const structureStatus = residualNegligible
    ? "pass"
    : residualAnalysis.prominence <= 8 || residualRelative <= 0.01
      ? "pass"
      : residualAnalysis.prominence <= 14 ? "warn" : "fail";
  const evidence = [];
  if (top) {
    evidence.push({
      id: "spectral_prominence",
      label: "主谱峰显著度",
      value: `${top.prominence.toFixed(1)}× 中位数`,
      detail: `${top.frequency.toFixed(3)} Hz`,
      status: top.prominence >= 8 ? "pass" : top.prominence >= 6 ? "warn" : "fail",
    });
    evidence.push({
      id: "fit_quality",
      label: "复指数拟合",
      value: r2 == null ? "不可计算" : `R² ${r2.toFixed(4)}`,
      detail: `RMSE ${metrics.rmse.toFixed(4)} a.u.`,
      status: r2 != null && r2 >= 0.98 ? "pass" : r2 != null && r2 >= 0.85 ? "warn" : "fail",
    });
    evidence.push({
      id: "residual_whiteness",
      label: "I 残差自相关",
      value: residualAnalysis.maxAcf.toFixed(3),
      detail: residualNegligible
        ? `残差能量仅 ${(residualRelative * 100).toFixed(3)}% 信号；ACF 不具实际意义`
        : "最大绝对 ACF（滞后 1–100）",
      status: highQuality && whitenessStatus === "fail" ? "warn" : whitenessStatus,
    });
    evidence.push({
      id: "residual_structure",
      label: "I 残余谱结构",
      value: `${residualAnalysis.prominence.toFixed(1)}× 中位数`,
      detail: residualAnalysis.frequency == null ? "无明显残余主频" : `残余主频 ${residualAnalysis.frequency.toFixed(3)} Hz`,
      status: highQuality && structureStatus === "fail" ? "warn" : structureStatus,
    });
    evidence.push({
      id: "frequency_resolution",
      label: "观测频率分辨率",
      value: `±${(1 / duration).toFixed(4)} Hz`,
      detail: `观测时长 ${duration.toFixed(4)} s；${(top.frequency * duration).toFixed(1)} 个周期`,
      status: top.frequency * duration >= 5 ? "pass" : top.frequency * duration >= 2 ? "warn" : "fail",
    });
  }
  const healthIssues = health.checks.filter((check) => check.status !== "pass");
  if (healthIssues.length) {
    evidence.push({
      id: "data_health",
      label: "数据体检（I 分量）",
      value: `${healthIssues.length} 项异常`,
      detail: healthIssues.map((check) => check.label).join("、"),
      status: health.status === "fail" ? "fail" : "warn",
    });
  }
  const unknown = !top || top.prominence < 6 || r2 == null || r2 < 0.5;
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
  const amplitude = fit ? Math.hypot(fit.coefficients[2], fit.coefficients[3]) : null;
  const phase = fit ? Math.atan2(fit.coefficients[3], fit.coefficients[2]) : null;
  const candidate = fit && top
    ? {
        id: "iq_single",
        family: "iq",
        label: "IQ 复指数模型",
        count: 1,
        frequencies: [frequency],
        parameters: [
          { id: "offset_i", label: "I 直流偏移", value: fit.coefficients[0], unit: "a.u." },
          { id: "offset_q", label: "Q 直流偏移", value: fit.coefficients[1], unit: "a.u." },
          { id: "frequency_1", label: "频率", value: frequency, unit: "Hz", sigma: 1 / duration, sigmaKind: "resolution" },
          { id: "amplitude_1", label: "复幅值", value: amplitude, unit: "a.u." },
          { id: "phase_1", label: "复相位", value: phase, unit: "rad", reference: "相对首样本" },
        ],
        metrics,
        residualAnalysis,
      }
    : null;
  const limitations = [
    "当前 IQ 分析仅支持单分量复指数模型，不代表完整复数调制模型库。",
    "IQ 模式的数据体检针对 I 分量；Q 分量未单独做削顶/漂移检查。",
    ...health.limitations,
  ];
  if (residualNegligible) {
    limitations.push("I 残差能量极低，ACF 与残余谱更适合视为数值效应，而非物理结构。");
  }
  if (highQuality && (whitenessStatus === "fail" || structureStatus === "fail")) {
    limitations.push("拟合极好但 I 残差仍有结构，可信等级限制为需要谨慎，避免过度自信。");
  }
  if (unknown) limitations.unshift("当前数据没有形成足够稳定的复指数候选，系统拒绝给出参数结论。");
  return {
    createdAt: new Date().toISOString(),
    kind: "iq",
    sampleCount: n,
    sampleRate,
    duration,
    nyquist: sampleRate / 2,
    spectrum,
    health,
    candidates: candidate ? [candidate] : [],
    best: candidate,
    unknown,
    recommendedId: unknown ? null : "iq_single",
    reliability: {
      level,
      label: levelLabel,
      evidence,
      limitations,
      nextSteps: ["提高信噪比或延长观测后重试。", "检查 I/Q 是否同相、正交以及采样是否同步。"],
      bicGap: null,
    },
    series: {
      time,
      observed: iValues,
      fitted: fit?.fittedI ?? iValues.map(() => meanI),
      residual: residualI,
    },
    iq: {
      q: qValues,
      fittedQ: fit?.fittedQ ?? qValues.map(() => meanQ),
      residualQ: fit?.residualQ ?? qValues.map((value) => value - meanQ),
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
  const modulationFrequency = best.parameters.find((parameter) => parameter.id === "modulation_frequency")?.value;
  const modulationIndex = best.parameters.find((parameter) => parameter.id === "modulation_index")?.value;
  const deviation = best.parameters.find((parameter) => parameter.id === "frequency_deviation")?.value;
  const observations = result.reliability.evidence.map((item) => `${item.label}：${item.value}；${item.detail}`);
  let summary;
  if (best.family === "am") {
    summary = `推荐 AM 调幅模型。载频约 ${frequency.toFixed(4)} Hz，调制频率约 ${modulationFrequency.toFixed(4)} Hz，调制指数约 ${modulationIndex.toFixed(3)}，R² 为 ${best.metrics.r2.toFixed(4)}。`;
    observations.unshift(`调制候选：AM，调制频率 ${modulationFrequency.toFixed(4)} Hz，调制指数 ${modulationIndex.toFixed(3)}。`);
  } else if (best.family === "fm") {
    summary = `推荐 FM 调频模型。载频约 ${frequency.toFixed(4)} Hz，调制频率约 ${modulationFrequency.toFixed(4)} Hz，频偏约 ${deviation.toFixed(4)} Hz，调制指数约 ${modulationIndex.toFixed(3)}，R² 为 ${best.metrics.r2.toFixed(4)}。`;
    observations.unshift(`调制候选：FM，调制频率 ${modulationFrequency.toFixed(4)} Hz，频偏 ${deviation.toFixed(4)} Hz。`);
  } else if (best.family === "iq") {
    const phase = best.parameters.find((parameter) => parameter.id === "phase_1")?.value;
    summary = `推荐 IQ 复指数模型。主频约 ${frequency.toFixed(4)} Hz，复幅值约 ${amplitude.toFixed(4)} a.u.，复相位约 ${phase.toFixed(4)} rad，R² 为 ${best.metrics.r2.toFixed(4)}。`;
    observations.unshift("I/Q 使用同一个复系数；当前仅支持单分量复指数模型。");
  } else {
    summary = `推荐${best.label}。主频约 ${frequency.toFixed(4)} Hz，主幅值约 ${amplitude.toFixed(4)} a.u.，R² 为 ${best.metrics.r2.toFixed(4)}。`;
  }
  return {
    summary,
    observations,
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
        uncertainty: parameter.sigma ?? null,
        uncertaintyKind: parameter.sigma == null ? null : (parameter.sigmaKind ?? "standard"),
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

export function buildDecision(result) {
  const evidence = result.reliability?.evidence ?? [];
  const ranked = [...(result.candidates ?? [])].sort((a, b) => a.metrics.bic - b.metrics.bic);
  if (!result.best || result.unknown) {
    return {
      title: "暂不推荐模型",
      confidence: result.reliability?.label ?? "证据不足",
      summary: "主谱峰不足或候选模型无法解释数据；系统拒绝给出参数结论。",
      evidenceIds: evidence.map((item) => item.id),
      whatWouldChange: [
        "提高信噪比或延长观测时长后重试。",
        "检查是否存在削顶、漂移、非平稳或单位错误。",
        "若信号含调制，确认 AM/FM 证据是否足够。",
      ],
      alternatives: [],
    };
  }

  const best = result.best;
  const runnerUp = ranked.find((candidate) => candidate.id !== best.id) ?? null;
  const gap = result.reliability?.bicGap ?? (runnerUp ? runnerUp.metrics.bic - best.metrics.bic : null);
  const gapText = gap == null ? "" : `，领先次优 ${gap.toFixed(1)} BIC`;
  const isModulation = best.family === "am" || best.family === "fm";
  const preferred = isModulation
    ? ["data_health", "spectral_prominence", "fit_quality", "modulation_structure", "residual_whiteness", "frequency_resolution"]
    : ["data_health", "spectral_prominence", "fit_quality", "residual_whiteness", "residual_structure", "frequency_resolution"];
  const evidenceIds = preferred
    .filter((id) => evidence.some((item) => item.id === id))
    .slice(0, 4);

  const whatWouldChange = [];
  const healthIssue = evidence.find((item) => item.id === "data_health");
  if (healthIssue) {
    whatWouldChange.push(`先处理数据体检：${healthIssue.detail}。`);
  }
  if (gap != null && gap < 10) {
    whatWouldChange.push("增加观测时长或降低噪声，使最优与次优的 BIC 差距超过 10。");
  }
  if (evidence.some((item) => item.id === "residual_whiteness" && item.status !== "pass")) {
    whatWouldChange.push("若残差结构来自未建模成分，加入相应候选后结论可能改变。");
  }
  if (evidence.some((item) => item.id === "frequency_resolution" && item.status !== "pass")) {
    whatWouldChange.push("延长观测时长可提高频率分辨率。");
  }
  if (isModulation) {
    whatWouldChange.push("若调制边带或瞬时频率证据不足，AM/FM 会降级为音调模型。");
  }
  whatWouldChange.push("若数据存在削顶、漂移或非平稳，当前结论不适用。");

  return {
    title: `推荐：${best.label}`,
    confidence: result.reliability.label,
    summary: isModulation
      ? `${best.label} 在当前候选库中 BIC 最低${gapText}；调制证据通过后才进入推荐。`
      : `${best.label} 在当前候选库中 BIC 最低${gapText}；结论仅覆盖当前候选模型。`,
    evidenceIds,
    whatWouldChange,
    alternatives: ranked.slice(0, 3).map((candidate) => ({
      label: candidate.label,
      bic: candidate.metrics.bic,
      gap: candidate.id === best.id ? 0 : candidate.metrics.bic - best.metrics.bic,
    })),
  };
}

export function buildExperimentPlan(result) {
  const items = [];
  const duration = result.duration;
  const sampleRate = result.sampleRate;
  const peaks = [...(result.spectrum?.peaks ?? [])]
    .filter((peak) => peak.prominence >= 6)
    .slice(0, 4);
  if (peaks.length >= 2) {
    const sorted = [...peaks].sort((a, b) => a.frequency - b.frequency);
    let closest = Number.POSITIVE_INFINITY;
    for (let index = 1; index < sorted.length; index += 1) {
      closest = Math.min(closest, sorted[index].frequency - sorted[index - 1].frequency);
    }
    if (Number.isFinite(closest) && closest > 0) {
      const required = 3 / closest;
      items.push({
        id: "separation",
        label: "频率分离",
        value: `T ≥ ${required.toFixed(2)} s`,
        detail: `最近峰间距 ${closest.toFixed(3)} Hz；当前 ${duration.toFixed(2)} s`,
        status: duration >= required ? "pass" : "warn",
      });
    }
  }

  const best = result.best;
  const modulation = best?.modulationEvidence;
  if (modulation) {
    const requiredDuration = 10 / modulation.frequency;
    items.push({
      id: "modulation_cycles",
      label: "调制周期",
      value: `T ≥ ${requiredDuration.toFixed(2)} s`,
      detail: `调制频率 ${modulation.frequency.toFixed(3)} Hz；建议至少 10 个周期`,
      status: duration >= requiredDuration ? "pass" : "warn",
    });
    const deviation = best.parameters.find((item) => item.id === "frequency_deviation")?.value ?? 0;
    const maxFrequency = modulation.carrierFrequency + deviation + modulation.frequency;
    const requiredRate = 2.5 * maxFrequency;
    items.push({
      id: "sample_rate",
      label: "采样率",
      value: `fs ≥ ${requiredRate.toFixed(0)} Hz`,
      detail: "载频、频偏和调制边带需低于 Nyquist",
      status: sampleRate >= requiredRate ? "pass" : "warn",
    });
  }

  if (result.health?.status !== "ok") {
    const issue = result.health?.checks?.find((check) => check.status !== "pass");
    items.push({
      id: "health",
      label: "先处理数据体检",
      value: issue?.label ?? "存在异常",
      detail: issue?.detail ?? "先消除削顶、漂移或跳变再分析",
      status: "warn",
    });
  }

  if (!items.length) {
    items.push({
      id: "baseline",
      label: "当前数据",
      value: "可直接演示",
      detail: "未发现明显的时长或采样率不足。",
      status: "pass",
    });
  }
  const warnings = items.filter((item) => item.status !== "pass").length;
  return {
    items,
    summary: warnings
      ? `${warnings} 条建议需要处理，再扩大样本或提高信噪比。`
      : "当前采样条件足以支撑本页演示；若要区分更近的模型，可继续延长观测。",
  };
}

function stressNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function stressGaussian(random) {
  const u = Math.max(random(), 1e-12);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

export function stressTest(time, values, baseline = null) {
  const n = values.length;
  const center = mean(values);
  const signalRms = rms(values.map((value) => value - center));
  const baseModel = baseline?.model ?? null;
  const variants = [];

  const run = (id, label, data) => {
    try {
      const result = analyzeSignal(data.time, data.values);
      const recommendedModel = result.unknown ? "unknown" : result.best?.label ?? "unknown";
      variants.push({
        id,
        label,
        recommendedModel,
        reliability: result.reliability.label,
        unknown: result.unknown,
        r2: result.best?.metrics.r2 ?? null,
        bicGap: result.reliability.bicGap ?? null,
        healthStatus: result.health?.status ?? "unknown",
        sampleCount: result.sampleCount,
        sampleRate: result.sampleRate,
        flipped: baseModel != null && recommendedModel !== baseModel,
      });
    } catch (error) {
      variants.push({
        id,
        label,
        error: error instanceof Error ? error.message : "分析失败",
        flipped: false,
      });
    }
  };

  const addNoise = (snrDb) => {
    const random = stressNoise(12345 + Math.round(snrDb));
    const sigma = signalRms / 10 ** (snrDb / 20);
    return {
      time,
      values: values.map((value) => value + sigma * stressGaussian(random)),
    };
  };

  run("noise20", "加噪 20 dB", addNoise(20));
  run("noise10", "加噪 10 dB", addNoise(10));

  const shortCount = Math.max(64, Math.floor(n * 0.5));
  run("short50", "观测减半", {
    time: time.slice(0, shortCount),
    values: values.slice(0, shortCount),
  });

  const decimatedTime = [];
  const decimatedValues = [];
  for (let index = 0; index < n; index += 2) {
    decimatedTime.push(time[index]);
    decimatedValues.push(values[index]);
  }
  run("decimate2", "降采样 2×", { time: decimatedTime, values: decimatedValues });

  const flipped = variants.filter((variant) => variant.flipped).length;
  return {
    baseline,
    variants,
    flipped,
    total: variants.length,
    summary: flipped
      ? `${flipped}/${variants.length} 个扰动场景发生结论翻转。`
      : `当前结论在 ${variants.length} 个扰动场景中保持稳定。`,
  };
}
