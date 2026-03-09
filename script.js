// Basic initialization hook for the dashboard.
// This file currently uses realistic mock data only.

let currentThreshold = 400;
let currentTimeRange = 90;
let currentStation = "poudre";
let showMovingAverage = false;
let fullData = [];
let latestChartDraw = null;

const STATION_CONFIG = {
  poudre: {
    label: "Cache la Poudre (Fort Collins)",
    baseMean: 180,
    seasonalAmp: 130,
    spikeMin: 450,
    spikeRange: 220,
    peakCount: [3, 5],
  },
  bigthompson: {
    label: "Big Thompson (Loveland)",
    baseMean: 110,
    seasonalAmp: 100,
    spikeMin: 380,
    spikeRange: 180,
    peakCount: [2, 4],
  },
  stvrain: {
    label: "St. Vrain (Longmont)",
    baseMean: 140,
    seasonalAmp: 115,
    spikeMin: 420,
    spikeRange: 200,
    peakCount: [4, 6],
  },
};

function getFilteredData() {
  return fullData.slice(-currentTimeRange);
}

function formatDateCSV(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function downloadCurrentWindowCSV() {
  const data = getFilteredData();
  if (!data.length) return;
  const header = "date,streamflow_cfs";
  const rows = data.map(
    (d) => `${formatDateCSV(d.date)},${d.streamflow_cfs}`
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `streamflow_${currentTimeRange}day_${formatDateCSV(data[0].date)}_to_${formatDateCSV(data[data.length - 1].date)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function computeMovingAverage7(data) {
  if (!data.length) return [];
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - 6);
    const slice = data.slice(start, i + 1);
    const sum = slice.reduce((s, d) => s + d.streamflow_cfs, 0);
    result.push(sum / slice.length);
  }
  return result;
}

function refreshDashboard() {
  const data = getFilteredData();
  updateStatusSummary(data, currentThreshold);
  updateKeyIndicators(data, data.length, currentThreshold);
  updateHighFlowEvents(data, currentThreshold);
  updateAiSummary(data, currentThreshold, data.length);
  renderStreamflowChart(data, currentThreshold);

  const chartPeriodEl = document.getElementById("chart-period");
  const indicatorPeriodEl = document.getElementById("indicator-period");
  const indicatorPeriodPercentileEl = document.getElementById("indicator-period-percentile");
  if (chartPeriodEl) chartPeriodEl.textContent = String(currentTimeRange);
  if (indicatorPeriodEl) indicatorPeriodEl.textContent = String(currentTimeRange);
  if (indicatorPeriodPercentileEl) indicatorPeriodPercentileEl.textContent = String(currentTimeRange);
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    fullData = generateMockStreamflowData(90, currentStation);

    const slider = document.getElementById("threshold-slider");
    const valueEl = document.getElementById("threshold-value");
    const timeRangeSelect = document.getElementById("time-range-select");

    if (slider instanceof HTMLInputElement) {
      slider.value = String(currentThreshold);

      slider.addEventListener("input", () => {
        const raw = Number(slider.value);
        if (!Number.isFinite(raw)) return;
        currentThreshold = raw;
        if (valueEl) valueEl.textContent = String(currentThreshold);
        refreshDashboard();
      });
    }

    if (timeRangeSelect instanceof HTMLSelectElement) {
      timeRangeSelect.addEventListener("change", () => {
        const val = Number(timeRangeSelect.value);
        if ([30, 60, 90].includes(val)) {
          currentTimeRange = val;
          refreshDashboard();
        }
      });
    }

    const stationSelect = document.getElementById("station-select");
    if (stationSelect instanceof HTMLSelectElement) {
      stationSelect.addEventListener("change", () => {
        const val = stationSelect.value;
        if (STATION_CONFIG[val]) {
          currentStation = val;
          fullData = generateMockStreamflowData(90, currentStation);
          refreshDashboard();
        }
      });
    }

    const movingAvgToggle = document.getElementById("moving-avg-toggle");
    if (movingAvgToggle instanceof HTMLInputElement) {
      movingAvgToggle.addEventListener("change", () => {
        showMovingAverage = movingAvgToggle.checked;
        refreshDashboard();
      });
    }

    const downloadCsvBtn = document.getElementById("download-csv-btn");
    if (downloadCsvBtn) {
      downloadCsvBtn.addEventListener("click", downloadCurrentWindowCSV);
    }

    if (valueEl) valueEl.textContent = String(currentThreshold);

    // Ensure layout is complete before the first draw.
    requestAnimationFrame(() => {
      refreshDashboard();
    });
  } catch (err) {
    showChartError(err);
  }
});

function generateMockStreamflowData(days, stationId) {
  const cfg = STATION_CONFIG[stationId] || STATION_CONFIG.poudre;
  const result = [];
  const today = new Date();

  const [pcMin, pcMax] = cfg.peakCount;
  const peakCount = pcMin + Math.floor(Math.random() * (pcMax - pcMin + 1));
  const peakIndices = new Set();
  while (peakIndices.size < peakCount) {
    const idx = Math.floor(Math.random() * (days - 14)) + 7;
    peakIndices.add(idx);
  }

  let previousFlow = cfg.baseMean + Math.random() * 50;

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    const idxFromStart = days - 1 - i;
    const t = idxFromStart / (days - 1 || 1); // 0..1

    const winterBase = cfg.baseMean * 0.5;
    const seasonalBase =
      winterBase +
      cfg.seasonalAmp * Math.sin(Math.PI * (t - 0.15)) +
      25 * Math.sin(2 * Math.PI * t);

    const pullStrength = 0.18;
    const dailyNoise = (Math.random() - 0.5) * 35;

    let flow =
      previousFlow +
      pullStrength * (seasonalBase - previousFlow) +
      dailyNoise;

    if (peakIndices.has(idxFromStart)) {
      flow = cfg.spikeMin + Math.random() * cfg.spikeRange;
    }

    flow = Math.max(35, Math.min(700, flow));

    if (flow < 60) {
      flow += (Math.random() - 0.5) * 10;
    }

    flow = Math.max(40, Math.min(650, flow));

    previousFlow = flow;

    result.push({
      date,
      streamflow_cfs: Math.round(flow),
    });
  }

  return result;
}

function updateStatusSummary(data, threshold) {
  const statusEl = document.getElementById("status-streamflow");
  if (!statusEl || !data.length) return;

  const latest = data[data.length - 1].streamflow_cfs;
  let descriptor;

  if (typeof threshold === "number" && latest >= threshold) {
    descriptor = "Elevated flow / flood-watch leaning";
  } else if (latest < 150) {
    descriptor = "Low flow / drought-leaning";
  } else {
    descriptor = "Normal range";
  }

  statusEl.textContent = `${latest} cfs · ${descriptor}`;
}

function updateKeyIndicators(data, periodDays, threshold) {
  if (!data.length) return;

  const current = data[data.length - 1].streamflow_cfs;
  const maxFlow = data.reduce(
    (max, d) => (d.streamflow_cfs > max ? d.streamflow_cfs : max),
    0
  );
  const avgFlow =
    data.reduce((sum, d) => sum + d.streamflow_cfs, 0) / data.length;

  const currentEl = document.getElementById("indicator-current-flow");
  const avgEl = document.getElementById("indicator-historical-average");
  const maxEl = document.getElementById("indicator-max-flow");

  if (currentEl) currentEl.textContent = `${current.toFixed(0)} cfs`;
  if (avgEl) avgEl.textContent = `${avgFlow.toFixed(0)} cfs`;
  if (maxEl) maxEl.textContent = `${maxFlow.toFixed(0)} cfs`;

  const periodEl = document.getElementById("indicator-period");
  if (periodEl && typeof periodDays === "number")
    periodEl.textContent = String(periodDays);

  const percentile = computePercentileRank(
    data.map((d) => d.streamflow_cfs),
    current
  );
  const pctEl = document.getElementById("indicator-current-percentile");
  const pctPeriodEl = document.getElementById("indicator-period-percentile");
  if (pctEl) pctEl.textContent = percentile != null ? `${percentile}th` : "—";
  if (pctPeriodEl && typeof periodDays === "number")
    pctPeriodEl.textContent = String(periodDays);

  const barContainer = document.getElementById("flow-bar-container");
  if (barContainer && maxFlow > 0) {
    const scale = Math.max(maxFlow, typeof threshold === "number" ? threshold : maxFlow);
    const currentPct = Math.min(100, (current / scale) * 100);
    const thresholdPct =
      typeof threshold === "number" && threshold <= scale
        ? Math.min(100, (threshold / scale) * 100)
        : null;
    barContainer.innerHTML = `
      <div class="flow-bar-track" role="img" aria-label="Current flow ${current} cfs, threshold ${thresholdPct != null ? threshold : "n/a"} cfs, max ${maxFlow} cfs">
        <div class="flow-bar-fill" style="width:${currentPct}%"></div>
        ${thresholdPct != null ? `<div class="flow-bar-threshold" style="left:${thresholdPct}%" title="Threshold: ${threshold} cfs"></div>` : ""}
      </div>
    `;
    barContainer.removeAttribute("aria-hidden");
  }
}

function percentileAt(sortedArr, p) {
  if (!sortedArr.length) return null;
  const idx = p * (sortedArr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (idx - lo) * (sortedArr[hi] - sortedArr[lo]);
}

function computePercentileRank(flows, value) {
  if (!flows.length) return null;
  const sorted = [...flows].sort((a, b) => a - b);
  const countBelow = sorted.filter((v) => v < value).length;
  return Math.round((countBelow / flows.length) * 100);
}

function detectHighFlowEvents(data, threshold) {
  if (!data.length || typeof threshold !== "number") return [];
  const events = [];
  let runStart = null;

  for (let i = 0; i < data.length; i++) {
    const above = data[i].streamflow_cfs >= threshold;
    if (above && runStart === null) {
      runStart = i;
    } else if (!above && runStart !== null) {
      const run = data.slice(runStart, i);
      const peakIdx = run.reduce(
        (best, d, j) => (d.streamflow_cfs > run[best].streamflow_cfs ? j : best),
        0
      );
      events.push({
        startDate: data[runStart].date,
        endDate: data[i - 1].date,
        peakFlow: run[peakIdx].streamflow_cfs,
        peakDate: run[peakIdx].date,
      });
      runStart = null;
    }
  }
  if (runStart !== null) {
    const run = data.slice(runStart);
    const peakIdx = run.reduce(
      (best, d, j) => (d.streamflow_cfs > run[best].streamflow_cfs ? j : best),
      0
    );
    events.push({
      startDate: data[runStart].date,
      endDate: data[data.length - 1].date,
      peakFlow: run[peakIdx].streamflow_cfs,
      peakDate: run[peakIdx].date,
    });
  }
  return events.slice(-5).reverse();
}

function updateHighFlowEvents(data, threshold) {
  const container = document.getElementById("high-flow-events");
  if (!container) return;
  const events = detectHighFlowEvents(data, threshold);

  if (!events.length) {
    container.innerHTML = '<p class="event-empty">No high-flow events in this window.</p>';
    return;
  }

  container.innerHTML = events
    .map(
      (e) =>
        `<div class="event-item">
          <div class="event-dates">${formatShortDate(e.startDate)} – ${formatShortDate(e.endDate)}</div>
          <div class="event-peak">Peak: ${e.peakFlow} cfs on ${formatShortDate(e.peakDate)}</div>
        </div>`
    )
    .join("");
}

function updateAiSummary(data, threshold, periodDays) {
  const summaryEl = document.getElementById("ai-summary-text");
  if (!summaryEl || !data.length) return;

  const current = data[data.length - 1].streamflow_cfs;
  const maxFlow = data.reduce(
    (max, d) => (d.streamflow_cfs > max ? d.streamflow_cfs : max),
    0
  );
  const avgFlow =
    data.reduce((sum, d) => sum + d.streamflow_cfs, 0) / data.length;

  const daysAboveThreshold =
    typeof threshold === "number"
      ? data.filter((d) => d.streamflow_cfs >= threshold).length
      : 0;

  const period = typeof periodDays === "number" ? periodDays : data.length;

  let interpretation;
  if (daysAboveThreshold >= 5 || current >= threshold) {
    interpretation = "elevated events observed";
  } else if (avgFlow < 150) {
    interpretation = "low-flow leaning";
  } else {
    interpretation = "normal range";
  }

  const thresholdText =
    typeof threshold === "number" ? `${threshold.toFixed(0)} cfs` : "n/a";

  summaryEl.textContent =
    `Current flow is ${current.toFixed(
      0
    )} cfs, with a ${period}-day average of ${avgFlow.toFixed(
      0
    )} cfs and a maximum of ${maxFlow.toFixed(0)} cfs. ` +
    `${daysAboveThreshold} of the last ${period} days were at or above the selected threshold of ${thresholdText} – ${interpretation}.`;
}

function renderStreamflowChart(data, threshold) {
  const canvas = document.getElementById("streamflow-chart");
  const tooltip = document.getElementById("chart-tooltip");
  const legendEl = document.getElementById("chart-legend");
  if (!(canvas instanceof HTMLCanvasElement) || !data.length) return;

  const ma7 = computeMovingAverage7(data);

  if (legendEl) {
    if (showMovingAverage) {
      legendEl.innerHTML =
        '<div class="legend-item"><span class="legend-line daily"></span> Daily</div>' +
        '<div class="legend-item"><span class="legend-line ma7"></span> 7-day avg</div>';
      legendEl.removeAttribute("aria-hidden");
    } else {
      legendEl.innerHTML =
        '<div class="legend-item"><span class="legend-line daily"></span> Daily</div>';
      legendEl.setAttribute("aria-hidden", "true");
    }
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  function draw(attempt = 0) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // If the canvas hasn't been laid out yet, wait a moment and retry.
    if ((rect.width === 0 || rect.height === 0) && attempt < 10) {
      window.setTimeout(() => draw(attempt + 1), 50);
      return;
    }

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padding = {
      top: 16,
      right: 16,
      bottom: 22,
      left: 26,
    };

    const width = rect.width;
    const height = rect.height;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    const flows = data.map((d) => d.streamflow_cfs);
    const minFlow = Math.min(...flows);
    const maxFlow = Math.max(...flows);

    const yMin = Math.max(0, minFlow - 20);
    const yMax = maxFlow + 30;

    const xScale = (index) =>
      padding.left + (index / (data.length - 1)) * chartWidth;
    const yScale = (value) =>
      padding.top + (1 - (value - yMin) / (yMax - yMin)) * chartHeight;

    // Gridlines
    const gridLines = 4;
    ctx.strokeStyle = "rgba(190, 220, 238, 0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (let i = 0; i <= gridLines; i++) {
      const yVal = yMin + ((yMax - yMin) * i) / gridLines;
      const y = yScale(yVal);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Context band: 25th–75th percentile "typical range"
    const sortedFlows = [...flows].sort((a, b) => a - b);
    const p25 = percentileAt(sortedFlows, 0.25);
    const p75 = percentileAt(sortedFlows, 0.75);
    if (p25 != null && p75 != null) {
      const y25 = yScale(p25);
      const y75 = yScale(p75);
      ctx.fillStyle = "rgba(31, 179, 198, 0.15)";
      ctx.fillRect(padding.left, y75, chartWidth, y25 - y75);
    }

    // Optional threshold line
    if (typeof threshold === "number") {
      const yThreshold = yScale(threshold);
      if (!Number.isNaN(yThreshold)) {
        ctx.beginPath();
        ctx.moveTo(padding.left, yThreshold);
        ctx.lineTo(width - padding.right, yThreshold);
        ctx.strokeStyle = "rgba(252, 94, 110, 0.85)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Line path
    ctx.beginPath();
    data.forEach((point, i) => {
      const x = xScale(i);
      const y = yScale(point.streamflow_cfs);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = "rgba(45, 228, 255, 0.96)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Area fill
    const lastIndex = data.length - 1;
    ctx.beginPath();
    data.forEach((point, i) => {
      const x = xScale(i);
      const y = yScale(point.streamflow_cfs);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xScale(lastIndex), yScale(yMin));
    ctx.lineTo(xScale(0), yScale(yMin));
    ctx.closePath();
    const gradient = ctx.createLinearGradient(
      0,
      padding.top,
      0,
      height - padding.bottom
    );
    gradient.addColorStop(0, "rgba(41, 194, 224, 0.36)");
    gradient.addColorStop(1, "rgba(3, 10, 20, 0.1)");
    ctx.fillStyle = gradient;
    ctx.fill();

    // Highlight points above threshold
    if (typeof threshold === "number") {
      ctx.fillStyle = "rgba(255, 112, 132, 0.95)";
      data.forEach((point, i) => {
        if (point.streamflow_cfs >= threshold) {
          const x = xScale(i);
          const y = yScale(point.streamflow_cfs);
          ctx.beginPath();
          ctx.arc(x, y, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // 7-day moving average overlay
    if (showMovingAverage && ma7.length) {
      ctx.beginPath();
      ma7.forEach((val, i) => {
        const x = xScale(i);
        const y = yScale(val);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = "rgba(255, 200, 100, 0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // X-axis ticks (monthly-ish)
    ctx.fillStyle = "rgba(188, 215, 233, 0.82)";
    ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI'";

    const tickCount = 4;
    for (let i = 0; i <= tickCount; i++) {
      const idx = Math.round((i / tickCount) * lastIndex);
      const { date } = data[idx];
      const x = xScale(idx);
      const y = height - padding.bottom + 12;
      const label = formatShortDate(date);
      ctx.textAlign = "center";
      ctx.fillText(label, x, y);
    }
  }

  latestChartDraw = draw;
  draw();

  if (!window.__chartResizeBound) {
    window.__chartResizeBound = true;
    window.addEventListener("resize", () => {
      if (latestChartDraw) latestChartDraw();
    });
  }

  // Hover / tooltip (handlers added once, read current data)
  if (!canvas.__chartTooltipBound) {
    canvas.__chartTooltipBound = true;
    canvas.addEventListener("mousemove", (event) => {
      const currentData = getFilteredData();
      if (!tooltip || !currentData.length) return;
      const rect = canvas.getBoundingClientRect();
      const xPos = event.clientX - rect.left;

      const paddingLeft = 26;
      const paddingRight = 16;
      const chartWidth = rect.width - paddingLeft - paddingRight;

      const ratio = (xPos - paddingLeft) / chartWidth;
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      const index = Math.round(clampedRatio * (currentData.length - 1));
      const point = currentData[index];
      if (!point) return;

      const flows = currentData.map((d) => d.streamflow_cfs);
      const minFlow = Math.min(...flows);
      const maxFlow = Math.max(...flows);
      const yMin = Math.max(0, minFlow - 20);
      const chartHeight = rect.height - 16 - 22;
      const xScale = (i) =>
        paddingLeft + (i / (currentData.length - 1)) * chartWidth;
      const yScale = (value) =>
        16 + (1 - (value - yMin) / (maxFlow + 30 - yMin)) * chartHeight;

      const px = xScale(index);
      const py = yScale(point.streamflow_cfs);

      let tipText = `${formatLongDate(point.date)} · ${point.streamflow_cfs} cfs`;
      if (showMovingAverage) {
        const ma7vals = computeMovingAverage7(currentData);
        const maVal = ma7vals[index];
        if (maVal != null) {
          tipText += ` · 7-day avg: ${Math.round(maVal)} cfs`;
        }
      }
      tooltip.textContent = tipText;
      tooltip.style.left = `${px}px`;
      tooltip.style.top = `${py}px`;
      tooltip.classList.add("visible");
      tooltip.setAttribute("aria-hidden", "false");
    });

    canvas.addEventListener("mouseleave", () => {
      if (!tooltip) return;
      tooltip.classList.remove("visible");
      tooltip.setAttribute("aria-hidden", "true");
    });
  }
}

function showChartError(err) {
  const panel = document.querySelector(".streamflow-panel");
  if (!panel) return;

  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";

  const note = document.createElement("p");
  note.style.marginTop = "0.75rem";
  note.style.color = "rgba(255, 220, 220, 0.9)";
  note.style.fontSize = "0.82rem";
  note.textContent = `Chart error: ${message}`;

  panel.appendChild(note);
}

function formatShortDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatLongDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
