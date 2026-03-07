// SVG Charting — Pure JS SVG generators for Tova
// 6 chart types: bar, line, scatter, histogram, pie, heatmap

const PALETTE = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#65a30d'];

const DEFAULT_MARGIN = { top: 40, right: 20, bottom: 60, left: 70 };

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getRows(data) {
  if (data && data._rows) return data._rows;
  if (Array.isArray(data)) return data;
  return [];
}

function niceTicks(min, max, count) {
  if (count === undefined) count = 5;
  if (min === max) { min = min - 1; max = max + 1; }
  const range = max - min;
  const roughStep = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const candidates = [1, 2, 5, 10];
  let step = mag;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] * mag >= roughStep) { step = candidates[i] * mag; break; }
  }
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.5; v += step) {
    ticks.push(Math.round(v * 1e10) / 1e10);
  }
  return ticks;
}

function formatNum(n) {
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) >= 1000) return String(Math.round(n));
  return n.toFixed(1);
}

function emptyChart(width, height, msg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family:system-ui,sans-serif"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#888" font-size="14">${esc(msg || 'No data')}</text></svg>`;
}

// ── Bar Chart ─────────────────────────────────────────────
export function bar_chart(data, opts) {
  if (!opts) opts = {};
  const rows = getRows(data);
  const width = opts.width || 600;
  const height = opts.height || 400;

  if (rows.length === 0) return emptyChart(width, height, 'No data');

  const xFn = opts.x;
  const yFn = opts.y;
  const title = opts.title || '';
  const color = opts.color || PALETTE[0];
  const margin = { ...DEFAULT_MARGIN };
  if (title) margin.top = 50;

  const labels = rows.map(r => String(xFn(r)));
  const values = rows.map(r => Number(yFn(r)));

  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const yMin = 0;
  const yMax = Math.max(...values);
  const ticks = niceTicks(yMin, yMax);
  const scaleMax = ticks[ticks.length - 1];

  const barGap = 0.15;
  const barW = plotW / labels.length;
  const innerW = barW * (1 - barGap);

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family:system-ui,sans-serif">`);

  // Title
  if (title) {
    parts.push(`<text x="${width / 2}" y="24" text-anchor="middle" font-size="16" font-weight="bold" fill="#111">${esc(title)}</text>`);
  }

  // Y-axis gridlines and labels
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i];
    if (t < yMin) continue;
    const y = margin.top + plotH - (t / scaleMax) * plotH;
    parts.push(`<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);
    parts.push(`<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#666">${formatNum(t)}</text>`);
  }

  // Bars
  for (let i = 0; i < labels.length; i++) {
    const barH = scaleMax > 0 ? (values[i] / scaleMax) * plotH : 0;
    const x = margin.left + i * barW + (barW - innerW) / 2;
    const y = margin.top + plotH - barH;
    const c = Array.isArray(color) ? color[i % color.length] : (opts.colors ? opts.colors[i % opts.colors.length] : color);
    parts.push(`<rect x="${x}" y="${y}" width="${innerW}" height="${barH}" fill="${c}" rx="2"/>`);
  }

  // X-axis baseline
  parts.push(`<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`);

  // X-axis labels
  const rotate = labels.length > 6;
  for (let i = 0; i < labels.length; i++) {
    const x = margin.left + i * barW + barW / 2;
    const y = margin.top + plotH + 16;
    if (rotate) {
      parts.push(`<text x="${x}" y="${y}" text-anchor="end" font-size="11" fill="#666" transform="rotate(-45 ${x} ${y})">${esc(labels[i])}</text>`);
    } else {
      parts.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="#666">${esc(labels[i])}</text>`);
    }
  }

  // Y-axis line
  parts.push(`<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`);

  parts.push('</svg>');
  return parts.join('\n');
}

// ── Line Chart ────────────────────────────────────────────
export function line_chart(data, opts) {
  if (!opts) opts = {};
  const rows = getRows(data);
  const width = opts.width || 600;
  const height = opts.height || 400;

  if (rows.length === 0) return emptyChart(width, height, 'No data');

  const xFn = opts.x;
  const yFn = opts.y;
  const title = opts.title || '';
  const color = opts.color || PALETTE[0];
  const showPoints = opts.points || false;
  const margin = { ...DEFAULT_MARGIN };
  if (title) margin.top = 50;

  const xValues = rows.map(r => xFn(r));
  const yValues = rows.map(r => Number(yFn(r)));

  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  // Determine if x is numeric
  const xNumeric = xValues.every(v => typeof v === 'number' && !isNaN(v));

  let xPositions;
  if (xNumeric) {
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const xRange = xMax - xMin || 1;
    xPositions = xValues.map(v => margin.left + ((v - xMin) / xRange) * plotW);
  } else {
    // Categorical: evenly spaced
    const n = xValues.length;
    xPositions = xValues.map((_, i) => margin.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2));
  }

  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const ticks = niceTicks(yMin > 0 ? 0 : yMin, yMax);
  const scaleMin = ticks[0];
  const scaleMax = ticks[ticks.length - 1];
  const scaleRange = scaleMax - scaleMin || 1;

  const yPositions = yValues.map(v => margin.top + plotH - ((v - scaleMin) / scaleRange) * plotH);

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family:system-ui,sans-serif">`);

  // Title
  if (title) {
    parts.push(`<text x="${width / 2}" y="24" text-anchor="middle" font-size="16" font-weight="bold" fill="#111">${esc(title)}</text>`);
  }

  // Y-axis gridlines and labels
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i];
    const y = margin.top + plotH - ((t - scaleMin) / scaleRange) * plotH;
    parts.push(`<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);
    parts.push(`<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#666">${formatNum(t)}</text>`);
  }

  // Line
  const points = xPositions.map((x, i) => `${x},${yPositions[i]}`).join(' ');
  parts.push(`<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`);

  // Points
  if (showPoints) {
    for (let i = 0; i < xPositions.length; i++) {
      parts.push(`<circle cx="${xPositions[i]}" cy="${yPositions[i]}" r="4" fill="${color}"/>`);
    }
  }

  // X-axis baseline
  parts.push(`<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`);

  // X-axis labels
  const labelStep = Math.max(1, Math.floor(xValues.length / 8));
  for (let i = 0; i < xValues.length; i += labelStep) {
    const x = xPositions[i];
    const y = margin.top + plotH + 16;
    parts.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="#666">${esc(String(xValues[i]))}</text>`);
  }

  // Y-axis line
  parts.push(`<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`);

  parts.push('</svg>');
  return parts.join('\n');
}

// ── Scatter Chart ─────────────────────────────────────────
export function scatter_chart(data, opts) {
  if (!opts) opts = {};
  const rows = getRows(data);
  const width = opts.width || 600;
  const height = opts.height || 400;

  if (rows.length === 0) return emptyChart(width, height, 'No data');

  const xFn = opts.x;
  const yFn = opts.y;
  const title = opts.title || '';
  const color = opts.color || PALETTE[0];
  const radius = opts.r || 5;
  const margin = { ...DEFAULT_MARGIN };
  if (title) margin.top = 50;

  const xValues = rows.map(r => Number(xFn(r)));
  const yValues = rows.map(r => Number(yFn(r)));

  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const xTicks = niceTicks(Math.min(...xValues), Math.max(...xValues));
  const yTicks = niceTicks(Math.min(...yValues), Math.max(...yValues));

  const xMin = xTicks[0];
  const xMax = xTicks[xTicks.length - 1];
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family:system-ui,sans-serif">`);

  // Title
  if (title) {
    parts.push(`<text x="${width / 2}" y="24" text-anchor="middle" font-size="16" font-weight="bold" fill="#111">${esc(title)}</text>`);
  }

  // Y-axis gridlines and labels
  for (let i = 0; i < yTicks.length; i++) {
    const t = yTicks[i];
    const y = margin.top + plotH - ((t - yMin) / yRange) * plotH;
    parts.push(`<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);
    parts.push(`<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#666">${formatNum(t)}</text>`);
  }

  // X-axis gridlines and labels
  for (let i = 0; i < xTicks.length; i++) {
    const t = xTicks[i];
    const x = margin.left + ((t - xMin) / xRange) * plotW;
    parts.push(`<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotH}" stroke="#e5e7eb" stroke-width="1"/>`);
    parts.push(`<text x="${x}" y="${margin.top + plotH + 16}" text-anchor="middle" font-size="11" fill="#666">${formatNum(t)}</text>`);
  }

  // Points
  for (let i = 0; i < rows.length; i++) {
    const cx = margin.left + ((xValues[i] - xMin) / xRange) * plotW;
    const cy = margin.top + plotH - ((yValues[i] - yMin) / yRange) * plotH;
    const c = Array.isArray(color) ? color[i % color.length] : color;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${c}" opacity="0.7"/>`);
  }

  // Axes
  parts.push(`<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`);
  parts.push(`<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`);

  parts.push('</svg>');
  return parts.join('\n');
}

// ── Histogram ─────────────────────────────────────────────
export function histogram(data, opts) {
  if (!opts) opts = {};
  const rows = getRows(data);
  const width = opts.width || 600;
  const height = opts.height || 400;

  if (rows.length === 0) return emptyChart(width, height, 'No data');

  const colFn = opts.col;
  const title = opts.title || '';
  const color = opts.color || PALETTE[0];
  const numBins = opts.bins || 20;
  const margin = { ...DEFAULT_MARGIN };
  if (title) margin.top = 50;

  const values = rows.map(r => Number(colFn(r))).filter(v => !isNaN(v));
  if (values.length === 0) return emptyChart(width, height, 'No data');

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const binWidth = (dataMax - dataMin) / numBins || 1;

  // Build bins
  const bins = [];
  for (let i = 0; i < numBins; i++) {
    bins.push({ lo: dataMin + i * binWidth, hi: dataMin + (i + 1) * binWidth, count: 0 });
  }

  // Count values into bins
  for (let i = 0; i < values.length; i++) {
    let idx = Math.floor((values[i] - dataMin) / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }

  const maxCount = Math.max(...bins.map(b => b.count));
  const ticks = niceTicks(0, maxCount);
  const scaleMax = ticks[ticks.length - 1];

  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const barW = plotW / numBins;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family:system-ui,sans-serif">`);

  // Title
  if (title) {
    parts.push(`<text x="${width / 2}" y="24" text-anchor="middle" font-size="16" font-weight="bold" fill="#111">${esc(title)}</text>`);
  }

  // Y-axis gridlines and labels
  for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i];
    const y = margin.top + plotH - (scaleMax > 0 ? (t / scaleMax) * plotH : 0);
    parts.push(`<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`);
    parts.push(`<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#666">${formatNum(t)}</text>`);
  }

  // Bars
  for (let i = 0; i < bins.length; i++) {
    const barH = scaleMax > 0 ? (bins[i].count / scaleMax) * plotH : 0;
    const x = margin.left + i * barW;
    const y = margin.top + plotH - barH;
    parts.push(`<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" stroke="#fff" stroke-width="0.5"/>`);
  }

  // X-axis baseline
  parts.push(`<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`);

  // X-axis labels (show a subset)
  const labelCount = Math.min(numBins + 1, 8);
  const labelStep = Math.max(1, Math.floor(numBins / (labelCount - 1)));
  for (let i = 0; i <= numBins; i += labelStep) {
    const val = dataMin + i * binWidth;
    const x = margin.left + i * barW;
    const y = margin.top + plotH + 16;
    parts.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="10" fill="#666">${formatNum(val)}</text>`);
  }

  // Y-axis line
  parts.push(`<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`);

  parts.push('</svg>');
  return parts.join('\n');
}

// ── Pie Chart ─────────────────────────────────────────────
export function pie_chart(data, opts) {
  if (!opts) opts = {};
  const rows = getRows(data);
  const width = opts.width || 400;
  const height = opts.height || 400;

  if (rows.length === 0) return emptyChart(width, height, 'No data');

  const labelFn = opts.label;
  const valueFn = opts.value;
  const title = opts.title || '';
  const colors = opts.colors || PALETTE;

  const labels = rows.map(r => String(labelFn(r)));
  const values = rows.map(r => Number(valueFn(r)));
  const total = values.reduce((a, b) => a + b, 0);

  if (total === 0) return emptyChart(width, height, 'No data');

  const cx = width / 2;
  const cy = title ? (height + 30) / 2 : height / 2;
  const r = Math.min(cx, cy) - 50;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family:system-ui,sans-serif">`);

  // Title
  if (title) {
    parts.push(`<text x="${width / 2}" y="24" text-anchor="middle" font-size="16" font-weight="bold" fill="#111">${esc(title)}</text>`);
  }

  let startAngle = -Math.PI / 2; // Start from top

  for (let i = 0; i < values.length; i++) {
    const sliceAngle = (values[i] / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const c = colors[i % colors.length];

    // Handle full circle (single slice)
    if (values.length === 1) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`);
    } else {
      parts.push(`<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${c}" stroke="#fff" stroke-width="1.5"/>`);
    }

    // Label at midpoint of arc
    const midAngle = startAngle + sliceAngle / 2;
    const labelR = r * 0.7;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    const pct = ((values[i] / total) * 100).toFixed(1);
    parts.push(`<text x="${lx}" y="${ly}" text-anchor="middle" font-size="11" fill="#fff" font-weight="bold">${esc(labels[i])}</text>`);
    parts.push(`<text x="${lx}" y="${ly + 13}" text-anchor="middle" font-size="10" fill="#fff">${pct}%</text>`);

    startAngle = endAngle;
  }

  parts.push('</svg>');
  return parts.join('\n');
}

// ── Heatmap ───────────────────────────────────────────────
export function heatmap(data, opts) {
  if (!opts) opts = {};
  const rows = getRows(data);
  const width = opts.width || 600;
  const height = opts.height || 400;

  if (rows.length === 0) return emptyChart(width, height, 'No data');

  const xFn = opts.x;
  const yFn = opts.y;
  const valueFn = opts.value;
  const title = opts.title || '';
  const margin = { top: title ? 50 : 40, right: 40, bottom: 60, left: 80 };

  // Extract unique x and y categories
  const xCats = [];
  const yCats = [];
  const xSet = new Set();
  const ySet = new Set();

  for (let i = 0; i < rows.length; i++) {
    const xv = String(xFn(rows[i]));
    const yv = String(yFn(rows[i]));
    if (!xSet.has(xv)) { xSet.add(xv); xCats.push(xv); }
    if (!ySet.has(yv)) { ySet.add(yv); yCats.push(yv); }
  }

  // Build value grid
  const grid = {};
  let vMin = Infinity;
  let vMax = -Infinity;
  for (let i = 0; i < rows.length; i++) {
    const xv = String(xFn(rows[i]));
    const yv = String(yFn(rows[i]));
    const val = Number(valueFn(rows[i]));
    grid[xv + '|' + yv] = val;
    if (val < vMin) vMin = val;
    if (val > vMax) vMax = val;
  }

  const vRange = vMax - vMin || 1;
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const cellW = plotW / xCats.length;
  const cellH = plotH / yCats.length;

  // Color interpolation: white (low) to indigo (high)
  function heatColor(val) {
    const t = (val - vMin) / vRange;
    const r = Math.round(255 - t * (255 - 79));
    const g = Math.round(255 - t * (255 - 70));
    const b = Math.round(255 - t * (255 - 229));
    return `rgb(${r},${g},${b})`;
  }

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="font-family:system-ui,sans-serif">`);

  // Title
  if (title) {
    parts.push(`<text x="${width / 2}" y="24" text-anchor="middle" font-size="16" font-weight="bold" fill="#111">${esc(title)}</text>`);
  }

  // Cells
  for (let xi = 0; xi < xCats.length; xi++) {
    for (let yi = 0; yi < yCats.length; yi++) {
      const key = xCats[xi] + '|' + yCats[yi];
      const val = grid[key];
      const x = margin.left + xi * cellW;
      const y = margin.top + yi * cellH;
      const fill = val !== undefined ? heatColor(val) : '#f3f4f6';
      parts.push(`<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="#fff" stroke-width="1"/>`);

      // Value text in cell
      if (val !== undefined) {
        const textColor = ((val - vMin) / vRange) > 0.5 ? '#fff' : '#111';
        parts.push(`<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="11" fill="${textColor}">${formatNum(val)}</text>`);
      }
    }
  }

  // X-axis labels (bottom)
  for (let xi = 0; xi < xCats.length; xi++) {
    const x = margin.left + xi * cellW + cellW / 2;
    const y = margin.top + plotH + 16;
    parts.push(`<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="#666">${esc(xCats[xi])}</text>`);
  }

  // Y-axis labels (left)
  for (let yi = 0; yi < yCats.length; yi++) {
    const x = margin.left - 8;
    const y = margin.top + yi * cellH + cellH / 2 + 4;
    parts.push(`<text x="${x}" y="${y}" text-anchor="end" font-size="11" fill="#666">${esc(yCats[yi])}</text>`);
  }

  parts.push('</svg>');
  return parts.join('\n');
}
