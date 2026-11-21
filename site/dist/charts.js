function formatNumber(value, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(3);
  }
  return value.toFixed(digits);
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

function chartPalette() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: styles.getPropertyValue("--site-muted").trim() || "#8aa09a",
    grid: styles.getPropertyValue("--site-border").trim() || "rgba(169,213,196,.15)",
    accent: styles.getPropertyValue("--site-accent").trim() || "#56e3a5",
    warn: styles.getPropertyValue("--warn").trim() || "#f7bc63",
    cyan: styles.getPropertyValue("--cyan").trim() || "#77d7ff",
  };
}

function colorWithAlpha(color, alpha) {
  if (!color.startsWith("#")) return `rgba(119,215,255,${alpha})`;
  const value = color.slice(1);
  const bigint = parseInt(value.length === 3 ? value.split("").map((char) => char + char).join("") : value, 16);
  return `rgba(${(bigint >> 16) & 255},${(bigint >> 8) & 255},${bigint & 255},${alpha})`;
}

export function drawPlot(canvas, x, lines, { fill = false, markers = [], xLabel = "", yLabel = "" } = {}) {
  const { context, width, height } = setupCanvas(canvas);
  const palette = chartPalette();
  const compact = width < 260;
  const margin = compact
    ? { left: 38, right: 8, top: 14, bottom: 22 }
    : { left: 49, right: 12, top: 18, bottom: 28 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  context.clearRect(0, 0, width, height);
  const values = lines.flatMap((line) => line.values).filter(Number.isFinite);
  if (!x.length || !values.length) return;
  let xMin = Math.min(...x);
  let xMax = Math.max(...x);
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  const yPad = Math.max((yMax - yMin) * 0.1, 1e-9);
  yMin -= yPad;
  yMax += yPad;
  const xScale = (value) => margin.left + ((value - xMin) / (xMax - xMin)) * plotWidth;
  const yScale = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  context.font = "10px Cascadia Code, Consolas, monospace";
  context.lineWidth = 1;
  const ySteps = plotHeight < 80 ? 2 : 4;
  for (let index = 0; index <= ySteps; index += 1) {
    const y = margin.top + (plotHeight * index) / ySteps;
    context.strokeStyle = palette.grid;
    context.beginPath();
    context.moveTo(margin.left, y);
    context.lineTo(width - margin.right, y);
    context.stroke();
    context.fillStyle = palette.text;
    const value = yMax - ((yMax - yMin) * index) / ySteps;
    const tick = formatNumber(value, 2);
    context.fillText(tick, Math.max(2, margin.left - 4 - context.measureText(tick).width), y + 3);
  }
  context.fillStyle = palette.text;
  context.fillText(formatNumber(xMin, 3), margin.left, height - 5);
  const rightLabel = formatNumber(xMax, 3);
  context.fillText(rightLabel, width - margin.right - context.measureText(rightLabel).width, height - 5);
  if (xLabel && !compact) context.fillText(xLabel, margin.left + plotWidth / 2 - 12, height - 7);
  if (yLabel) context.fillText(yLabel, 3, 9);

  for (const line of lines) {
    const points = line.values.map((value, index) => ({
      x: xScale(x[index]),
      y: yScale(value),
    }));
    if (fill) {
      context.beginPath();
      context.moveTo(points[0].x, margin.top + plotHeight);
      for (const point of points) context.lineTo(point.x, point.y);
      context.lineTo(points.at(-1).x, margin.top + plotHeight);
      context.closePath();
      const gradient = context.createLinearGradient(0, margin.top, 0, margin.top + plotHeight);
      gradient.addColorStop(0, colorWithAlpha(palette.cyan, 0.22));
      gradient.addColorStop(1, colorWithAlpha(palette.cyan, 0.01));
      context.fillStyle = gradient;
      context.fill();
    }
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.strokeStyle = line.color === "accent" ? palette.accent : line.color === "warn" ? palette.warn : palette.cyan;
    context.lineWidth = line.width || 1.4;
    context.lineJoin = "round";
    context.stroke();
  }
  markers.forEach((marker, index) => {
    const px = xScale(marker.x);
    const py = yScale(marker.y);
    context.strokeStyle = colorWithAlpha(palette.warn, 0.5);
    context.setLineDash([3, 4]);
    context.beginPath();
    context.moveTo(px, margin.top);
    context.lineTo(px, margin.top + plotHeight);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = palette.warn;
    context.beginPath();
    context.arc(px, py, 3, 0, Math.PI * 2);
    context.fill();
    if (index < 3) {
      context.fillStyle = palette.text;
      context.fillText(`${marker.label}`, Math.min(px + 5, width - 74), margin.top + 12 + index * 13);
    }
  });
}
