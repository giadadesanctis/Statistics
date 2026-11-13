/*
 * Homework 6 page: contingency tables, frequencies, expected counts, chi-square test,
 * permutation test, interpretation and the confounding example. Needs independence.js.
 */
(() => {
  const L = window.IndependenceLab;
  if (!L) return;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (v, digits = 3) => {
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-US');
    const r = Number(v.toPrecision(digits));
    return Object.is(r, -0) ? '0' : String(r);
  };
  const fix = (v, d = 2) => (Number.isFinite(v) ? (Object.is(Number(v.toFixed(d)), -0) ? (0).toFixed(d) : v.toFixed(d)) : '—');
  const pct = (v, d = 1) => (Number.isFinite(v) ? `${(100 * v).toFixed(d)}%` : '—');
  const signed = (v, d = 2) => (v > 0 ? `+${fix(v, d)}` : fix(v, d).replace('-', '−'));
  const pFmt = (p) => {
    if (!Number.isFinite(p)) return '—';
    if (p === 0) return '< 1e−300';
    if (p < 1e-4) return p.toExponential(2).replace('e-', 'e−');
    return p.toFixed(4);
  };
  const tiles = (rows) => rows.map(([label, value, note]) => `<div class="stat-tile"><span class="stat-label">${label}</span><span class="stat-value">${value}</span><span class="stat-note">${note}</span></div>`).join('');

  // Validated categorical order (same palette as the previous homework).
  const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#e87ba4', '#8a63d2', '#c9a227'];
  const colorOf = (j) => COLORS[j % COLORS.length];

  // A contingency-style table: header row of F categories, one row per X category,
  // optional total row and column. cell(i, j) returns the HTML of a body cell.
  const grid = (T, { cell, rowTotal = null, colTotal = null, corner = null, cellStyle = null, caption = '' }) => {
    const head = `<tr><th scope="col">${esc(T.xName)} \\ ${esc(T.fName)}</th>${T.fs.map((f) => `<th scope="col">${esc(f)}</th>`).join('')}${rowTotal ? `<th scope="col" class="is-total">${rowTotal.label}</th>` : ''}</tr>`;
    const body = T.xs.map((x, i) => `<tr><th scope="row">${esc(x)}</th>${T.fs.map((_, j) => `<td${cellStyle ? ` style="${cellStyle(i, j)}"` : ''}>${cell(i, j)}</td>`).join('')}${rowTotal ? `<td class="is-total">${rowTotal.value(i)}</td>` : ''}</tr>`).join('');
    const foot = colTotal ? `<tr><th scope="row" class="is-total">${colTotal.label}</th>${T.fs.map((_, j) => `<td class="is-total">${colTotal.value(j)}</td>`).join('')}${rowTotal ? `<td class="is-total">${corner ?? ''}</td>` : ''}</tr>` : '';
    return `<div class="table-scroll"><table class="data-table data-table--compact">${caption ? `<caption>${caption}</caption>` : ''}<thead>${head}</thead><tbody>${body}${foot}</tbody></table></div>`;
  };

  // ---------------------------------------------------------------- charts
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const el = (name, attributes = {}, parent = null) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (parent) parent.append(element);
    return element;
  };
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.hidden = true;
  document.body.append(tooltip);
  const showTip = (event, html) => {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(event.clientX + 12, window.innerWidth - 240)}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
  };
  const hideTip = () => { tooltip.hidden = true; };

  const niceTicks = (lo, hi, count = 5) => {
    const raw = (hi - lo) / count;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((f) => f * power).find((s) => s >= raw);
    const ticks = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
    return ticks;
  };

  const legend = (container, items) => {
    const box = document.createElement('div');
    box.className = 'chart-legend';
    box.innerHTML = items.map(([name, color, dash]) => `<span class="chart-legend-item"><span class="chart-swatch" style="background:${color};${dash ? 'height:2px;opacity:.8' : ''}"></span>${esc(name)}</span>`).join('');
    container.prepend(box);
  };

  // 100% stacked horizontal bars: one per X category, plus the marginal distribution of F.
  const profileChart = (container, T, freq) => {
    container.innerHTML = '';
    const rows = T.xs.map((x, i) => ({ name: x, values: freq.rowProfiles[i], n: T.rowTotals[i] }));
    rows.push({ name: 'All (marginal)', values: freq.colMarginal, n: T.n, marginal: true });
    const wide = container.clientWidth > 640;
    const width = wide ? 900 : 560;
    const labelW = wide ? 150 : 110;
    const barH = 26;
    const gap = 10;
    const top = 6;
    const height = top + rows.length * (barH + gap) + 26;
    const plotW = width - labelW - 16;
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' }, container);
    const axis = el('g', { class: 'chart-axis' }, svg);
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      const x = labelW + t * plotW;
      el('line', { x1: x, x2: x, y1: top, y2: height - 22, class: 'chart-gridline' }, axis);
      el('text', { x, y: height - 8, 'text-anchor': 'middle' }, axis).textContent = `${t * 100}%`;
    });
    rows.forEach((row, r) => {
      const y = top + r * (barH + gap) + (row.marginal ? 4 : 0);
      const label = row.name.length > 20 ? `${row.name.slice(0, 19)}…` : row.name;
      el('text', { x: labelW - 8, y: y + barH / 2 + 4, 'text-anchor': 'end', ...(row.marginal ? { 'font-weight': 700 } : {}) }, axis).textContent = label;
      let acc = 0;
      row.values.forEach((v, j) => {
        if (!(v > 0)) return;
        const x = labelW + acc * plotW;
        const w = v * plotW;
        const rect = el('rect', { x, y, width: Math.max(0.5, w - 1), height: barH, fill: colorOf(j), 'fill-opacity': row.marginal ? 1 : 0.85 }, svg);
        rect.addEventListener('pointermove', (event) => showTip(event, `<strong>${esc(row.name)}</strong>${esc(T.fName)} = ${esc(T.fs[j])}<br>${pct(v)} of ${row.n.toLocaleString('en-US')}`));
        rect.addEventListener('pointerleave', hideTip);
        if (w > 38) el('text', { x: x + w / 2, y: y + barH / 2 + 4, 'text-anchor': 'middle', class: 'chart-segment-label' }, svg).textContent = pct(v, 0);
        acc += v;
      });
    });
    legend(container, T.fs.map((f, j) => [`${T.fName} = ${f}`, colorOf(j)]));
  };

  // Generic frame for the density charts.
  const frame = (container, { x0, x1, y0, y1, xLabel, yLabel }) => {
    container.innerHTML = '';
    const wide = container.clientWidth > 640;
    const width = wide ? 900 : 560;
    const height = wide ? 280 : 240;
    const plot = { x: 56, y: 14, w: width - 70, h: height - 56 };
    const sx = (v) => plot.x + ((v - x0) / (x1 - x0)) * plot.w;
    const sy = (v) => plot.y + plot.h - ((v - y0) / (y1 - y0)) * plot.h;
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' }, container);
    const axis = el('g', { class: 'chart-axis' }, svg);
    niceTicks(y0, y1, 4).forEach((v) => {
      el('line', { x1: plot.x, x2: plot.x + plot.w, y1: sy(v), y2: sy(v), class: 'chart-gridline' }, axis);
      el('text', { x: plot.x - 8, y: sy(v) + 4, 'text-anchor': 'end' }, axis).textContent = fmt(v);
    });
    el('line', { x1: plot.x, x2: plot.x + plot.w, y1: plot.y + plot.h, y2: plot.y + plot.h, class: 'chart-baseline' }, axis);
    niceTicks(x0, x1, wide ? 10 : 6).forEach((v) => {
      el('text', { x: sx(v), y: plot.y + plot.h + 16, 'text-anchor': 'middle' }, axis).textContent = fmt(v);
    });
    el('text', { x: plot.x + plot.w / 2, y: height - 4, 'text-anchor': 'middle', class: 'chart-label' }, axis).textContent = xLabel;
    el('text', { x: 12, y: plot.y + plot.h / 2, 'text-anchor': 'middle', class: 'chart-label', transform: `rotate(-90 12 ${plot.y + plot.h / 2})` }, axis).textContent = yLabel;
    const id = `clip-${Math.random().toString(36).slice(2)}`;
    el('rect', { x: plot.x, y: plot.y, width: plot.w, height: plot.h }, el('clipPath', { id }, el('defs', {}, svg)));
    return { svg, g: el('g', { 'clip-path': `url(#${id})` }, svg), sx, sy, plot };
  };

  // x-range for a chi-square chart: the bulk of the null distribution and the critical value,
  // and the observed value if it is not absurdly far in the tail.
  const xRange = (df, crit, obs) => {
    const bulk = Math.max(crit * 1.5, df + 5 * Math.sqrt(2 * df));
    return obs <= bulk * 2 ? Math.max(bulk, obs * 1.12) : bulk;
  };

  const densityPath = (sx, sy, df, x1, yCap) => {
    const pts = [];
    for (let k = 0; k <= 400; k += 1) {
      const x = Math.max(1e-6, (x1 * k) / 400);
      pts.push(`${k ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(Math.min(yCap, L.chiSquarePdf(x, df))).toFixed(1)}`);
    }
    return pts.join('');
  };

  // Vertical marker for the observed statistic, or an arrow at the right edge if it is off scale.
  const observedMarker = (svg, g, sx, plot, obs, x1) => {
    if (obs <= x1) {
      el('line', { x1: sx(obs), x2: sx(obs), y1: plot.y, y2: plot.y + plot.h, class: 'chart-observed' }, g);
      el('text', { x: Math.min(sx(obs) + 6, plot.x + plot.w - 110), y: plot.y + 12, class: 'chart-annotation' }, svg).textContent = `observed χ² = ${fmt(obs, 4)}`;
    } else {
      el('text', { x: plot.x + plot.w - 4, y: plot.y + 12, 'text-anchor': 'end', class: 'chart-annotation' }, svg).textContent = `observed χ² = ${fmt(obs, 4)} → far off scale`;
    }
  };

  const densityChart = (container, df, crit, obs) => {
    const x1 = xRange(df, crit, obs);
    const peak = df <= 2 ? 0.5 : L.chiSquarePdf(df - 2, df);
    const y1 = Math.min(peak, 1) * 1.15;
    const { svg, g, sx, sy, plot } = frame(container, { x0: 0, x1, y0: 0, y1, xLabel: `χ² with ν = ${df}`, yLabel: 'density' });
    // Rejection region.
    const area = [`M${sx(crit).toFixed(1)},${sy(0).toFixed(1)}`];
    for (let k = 0; k <= 200; k += 1) {
      const x = crit + ((x1 - crit) * k) / 200;
      area.push(`L${sx(x).toFixed(1)},${sy(Math.min(y1, L.chiSquarePdf(x, df))).toFixed(1)}`);
    }
    area.push(`L${sx(x1).toFixed(1)},${sy(0).toFixed(1)}Z`);
    el('path', { d: area.join(''), class: 'chart-rejection' }, g);
    el('path', { d: densityPath(sx, sy, df, x1, y1 * 1.2), class: 'chart-line', stroke: COLORS[0] }, g);
    el('line', { x1: sx(crit), x2: sx(crit), y1: plot.y + plot.h * 0.25, y2: plot.y + plot.h, class: 'chart-critical' }, g);
    el('text', { x: sx(crit) + 5, y: plot.y + plot.h * 0.25 + 10, class: 'chart-reference-label' }, svg).textContent = `critical value ${fmt(crit, 4)}`;
    observedMarker(svg, g, sx, plot, obs, x1);
    const hit = el('rect', { x: plot.x, y: plot.y, width: plot.w, height: plot.h, class: 'chart-hit' }, svg);
    hit.addEventListener('pointermove', (event) => {
      const box = svg.getBoundingClientRect();
      const mx = (event.clientX - box.left) * (svg.viewBox.baseVal.width / box.width);
      const x = Math.max(0, ((mx - plot.x) / plot.w) * x1);
      showTip(event, `<strong>x = ${fmt(x, 4)}</strong>density ${fmt(L.chiSquarePdf(x, df), 3)}<br>P(χ² ≥ x) = ${pFmt(L.chiSquareSf(x, df))}`);
    });
    hit.addEventListener('pointerleave', hideTip);
  };

  const permChart = (container, df, crit, perm) => {
    const { stats, observed } = perm;
    const x1 = xRange(df, crit, observed);
    const bins = 40;
    const width = x1 / bins;
    const hist = new Array(bins).fill(0);
    let beyond = 0;
    for (const s of stats) {
      const b = Math.floor(s / width);
      if (b < bins) hist[b] += 1; else beyond += 1;
    }
    const dens = hist.map((h) => h / (stats.length * width));
    const peak = df <= 2 ? Math.max(...dens) : Math.max(L.chiSquarePdf(df - 2, df), ...dens);
    const y1 = peak * 1.15;
    const { svg, g, sx, sy, plot } = frame(container, { x0: 0, x1, y0: 0, y1, xLabel: 'χ² of a shuffled table', yLabel: 'density' });
    dens.forEach((d, b) => {
      if (!d) return;
      const rect = el('rect', { x: sx(b * width) + 0.5, y: sy(d), width: Math.max(0.5, sx(width) - sx(0) - 1), height: sy(0) - sy(d), class: 'chart-bar--muted' }, g);
      rect.addEventListener('pointermove', (event) => showTip(event, `<strong>[${fmt(b * width, 3)}, ${fmt((b + 1) * width, 3)})</strong>${hist[b]} of ${stats.length} shuffles`));
      rect.addEventListener('pointerleave', hideTip);
    });
    el('path', { d: densityPath(sx, sy, df, x1, y1 * 1.2), class: 'chart-line', stroke: COLORS[0] }, g);
    observedMarker(svg, g, sx, plot, observed, x1);
    legend(container, [['permutation distribution', '#cdb4df'], [`χ² density, ν = ${df}`, COLORS[0]]]);
    if (beyond) {
      const note = document.createElement('p');
      note.className = 'keygen-note';
      note.textContent = `${beyond} shuffled values beyond ${fmt(x1, 3)} are not drawn.`;
      container.append(note);
    }
  };

  // ---------------------------------------------------------------- analysis
  const strength = (V, k) => {
    // Cohen's thresholds for V depend on min(r, c) - 1.
    const t = [0.1, 0.3, 0.5].map((x) => x / Math.sqrt(Math.max(1, k)));
    if (V < t[0]) return 'negligible';
    if (V < t[1]) return 'weak';
    if (V < t[2]) return 'moderate';
    return 'strong';
  };

  const analyse = (T) => {
    const freq = L.frequencies(T);
    const chi = L.chiSquare(T);
    return { T, freq, chi };
  };

  // ---------------------------------------------------------------- state
  const form = $('[data-data-form]');
  let current = null; // { T, freq, chi, records, model }

  const loadDataset = () => {
    const id = $('[name="dataset"]', form).value;
    const error = $('[data-data-error]');
    error.hidden = true;
    if (id === 'custom') {
      try {
        const { names, records } = L.parseCsv($('[name="csv"]', form).value);
        const T = L.contingency(records);
        if (T.xs.length < 2 || T.fs.length < 2) throw new Error('Each variable needs at least two categories.');
        return { records, T: { ...T, xName: names[0], fName: names[1] }, title: 'My own data', model: 'Data pasted in the box above. The categories keep their order of first appearance.' };
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        $('[name="dataset"]', form).value = 'logins';
        return loadDataset();
      }
    }
    const D = L.DATASETS.find((d) => d.id === id);
    const records = D.records();
    const T = L.contingency(records, D.xs, D.fs);
    return { records, T: { ...T, xName: D.xName, fName: D.fName }, title: D.title, model: D.model };
  };

  const alpha = () => Number($('[name="alpha"]', form).value);

  // ---------------------------------------------------------------- rendering
  const renderData = (S) => {
    const { T, records } = S;
    $('[data-model]').innerHTML = `<strong>${esc(S.title)}</strong><p>${esc(S.model)}</p>`;
    $('[data-data-tiles]').innerHTML = tiles([
      ['Observations n', T.n.toLocaleString('en-US'), 'raw records'],
      [`X: ${esc(T.xName)}`, String(T.xs.length), `categories (r): ${T.xs.map(esc).join(', ')}`],
      [`F: ${esc(T.fName)}`, String(T.fs.length), `categories (c): ${T.fs.map(esc).join(', ')}`],
      ['Cells r × c', String(T.xs.length * T.fs.length), 'of the contingency table']
    ]);
    const shown = records.slice(0, 8);
    $('[data-raw]').innerHTML = `<div class="table-scroll"><table class="data-table data-table--compact"><thead><tr><th scope="col">k</th><th scope="col">${esc(T.xName)} (X)</th><th scope="col">${esc(T.fName)} (F)</th></tr></thead><tbody>${shown.map(([x, f], k) => `<tr><th scope="row">${k + 1}</th><td>${esc(x)}</td><td>${esc(f)}</td></tr>`).join('')}<tr><th scope="row">…</th><td>…</td><td>…</td></tr></tbody></table></div><p class="keygen-note">${records.length > 8 ? `${(records.length - 8).toLocaleString('en-US')} more records not shown.` : ''}</p>`;
  };

  const renderTables = (S) => {
    const { T, freq, chi } = S;
    const N = (v) => v.toLocaleString('en-US');
    $('[data-counts]').innerHTML = grid(T, {
      cell: (i, j) => N(T.counts[i][j]),
      rowTotal: { label: 'n<sub>i·</sub>', value: (i) => N(T.rowTotals[i]) },
      colTotal: { label: 'n<sub>·j</sub>', value: (j) => N(T.colTotals[j]) },
      corner: `n = ${N(T.n)}`
    });
    $('[data-joint]').innerHTML = grid(T, {
      cell: (i, j) => fix(freq.joint[i][j], 4),
      rowTotal: { label: 'f<sub>i·</sub>', value: (i) => fix(freq.rowMarginal[i], 4) },
      colTotal: { label: 'f<sub>·j</sub>', value: (j) => fix(freq.colMarginal[j], 4) },
      corner: '1'
    });
    $('[data-rowprof]').innerHTML = grid(T, {
      cell: (i, j) => pct(freq.rowProfiles[i][j]),
      rowTotal: { label: 'total', value: () => '100%' },
      colTotal: { label: 'marginal f<sub>·j</sub>', value: (j) => pct(freq.colMarginal[j]) },
      corner: '100%'
    });
    $('[data-colprof]').innerHTML = grid(T, {
      cell: (i, j) => pct(freq.colProfiles[i][j]),
      rowTotal: { label: 'marginal f<sub>i·</sub>', value: (i) => pct(freq.rowMarginal[i]) },
      colTotal: { label: 'total', value: () => '100%' },
      corner: '100%'
    });
    profileChart($('[data-chart="profiles"]'), T, freq);

    // Largest gap between a row profile and the marginal, for the comment under the chart.
    let best = { gap: 0 };
    T.xs.forEach((x, i) => T.fs.forEach((f, j) => {
      const gap = freq.rowProfiles[i][j] - freq.colMarginal[j];
      if (T.rowTotals[i] && Math.abs(gap) > Math.abs(best.gap)) best = { gap, i, j };
    }));
    $('[data-profile-comment]').innerHTML = best.i === undefined ? '' : `The largest departure from the marginal profile: among the records with ${esc(T.xName)} = <strong>${esc(T.xs[best.i])}</strong>, the share with ${esc(T.fName)} = <strong>${esc(T.fs[best.j])}</strong> is ${pct(freq.rowProfiles[best.i][best.j])}, against ${pct(freq.colMarginal[best.j])} overall (${best.gap > 0 ? '+' : '−'}${(100 * Math.abs(best.gap)).toFixed(1)} percentage points). Whether gaps of this size can be explained by chance is what the chi-square test decides.`;

    $('[data-expected]').innerHTML = grid(T, {
      cell: (i, j) => fix(chi.expected[i][j], 2),
      rowTotal: { label: 'n<sub>i·</sub>', value: (i) => N(T.rowTotals[i]) },
      colTotal: { label: 'n<sub>·j</sub>', value: (j) => N(T.colTotals[j]) },
      corner: `n = ${N(T.n)}`,
      cellStyle: (i, j) => (chi.expected[i][j] < 5 ? 'color:#c0392b;font-weight:600' : '')
    });
    $('[data-diff]').innerHTML = grid(T, {
      cell: (i, j) => signed(T.counts[i][j] - chi.expected[i][j], 2),
      rowTotal: { label: 'row sum', value: () => '0' },
      colTotal: { label: 'column sum', value: () => '0' },
      corner: '0'
    });
    const shade = (r) => {
      const a = Math.min(0.75, Math.abs(r) / 8);
      const rgb = r > 0 ? '42,120,214' : '235,104,52';
      return `background:rgba(${rgb},${a.toFixed(3)});${Math.abs(r) > 1.96 ? 'font-weight:700;' : ''}`;
    };
    $('[data-adjusted]').innerHTML = grid(T, { cell: (i, j) => signed(chi.adjusted[i][j], 2), cellStyle: (i, j) => shade(chi.adjusted[i][j]) });
  };

  const renderChi = (S) => {
    const { T, chi } = S;
    const a = alpha();
    const crit = L.chiSquareQuantile(a, chi.df);
    const reject = chi.pValue < a;
    const k = Math.min(T.xs.length, T.fs.length) - 1;
    $('[data-chi-tiles]').innerHTML = tiles([
      ['χ² statistic', fmt(chi.stat, 5), `shortcut formula: ${fmt(L.chiSquareShortcut(T), 5)}`],
      ['Degrees of freedom ν', String(chi.df), `(${T.xs.length} − 1)(${T.fs.length} − 1)`],
      ['p-value', pFmt(chi.pValue), `P(χ²<sub>${chi.df}</sub> ≥ ${fmt(chi.stat, 4)})`],
      [`Critical value, α = ${a}`, fmt(crit, 5), reject ? 'χ² is above it: reject H₀' : 'χ² is below it: do not reject H₀'],
      ["Cramér's V", fix(chi.cramersV, 3), `${strength(chi.cramersV, k)} association`],
      ['Smallest expected count', fix(chi.minExpected, 2), chi.smallCells ? `${chi.smallCells} of ${chi.cellCount} cells below 5` : 'all cells ≥ 5: approximation reliable']
    ]);
    $('[data-contrib]').innerHTML = grid(T, {
      cell: (i, j) => fix(chi.contributions[i][j], 3),
      rowTotal: { label: 'row sum', value: (i) => fix(chi.contributions[i].reduce((s, v) => s + v, 0), 3) },
      colTotal: { label: 'column sum', value: (j) => fix(chi.contributions.reduce((s, row) => s + row[j], 0), 3) },
      corner: `χ² = ${fix(chi.stat, 3)}`
    });
    densityChart($('[data-chart="density"]'), chi.df, crit, chi.stat);
  };

  const renderPerm = (S, seed = 7) => {
    const { T, chi, records } = S;
    const perm = L.permutationTest(T, records, 2000, seed);
    const mean = perm.stats.reduce((s, v) => s + v, 0) / perm.B;
    const atLeast = Math.round(perm.pValue * (perm.B + 1)) - 1;
    $('[data-perm-tiles]').innerHTML = tiles([
      ['Permutation p-value', perm.pValue < 1 / perm.B ? `< ${fix(1 / perm.B, 4)}` : fix(perm.pValue, 4), `${atLeast} of ${perm.B} shuffles reach χ² ≥ ${fmt(chi.stat, 4)}`],
      ['Chi-square p-value', pFmt(chi.pValue), 'asymptotic approximation'],
      ['Mean of shuffled χ²', fmt(mean, 4), `theory: E[χ²<sub>ν</sub>] = ν = ${chi.df}`]
    ]);
    permChart($('[data-chart="perm"]'), chi.df, L.chiSquareQuantile(alpha(), chi.df), perm);
  };

  const interpretation = (S) => {
    const { T, freq, chi } = S;
    const a = alpha();
    const k = Math.min(T.xs.length, T.fs.length) - 1;
    const reject = chi.pValue < a;
    const cells = [];
    T.xs.forEach((x, i) => T.fs.forEach((f, j) => cells.push({ i, j, r: chi.adjusted[i][j] })));
    cells.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
    // With two columns the residuals of a row are opposite: keep only the positive one.
    const top = cells.filter((cl) => T.fs.length !== 2 || cl.r > 0).filter((c) => Math.abs(c.r) > 1.96).slice(0, 3);
    const cellText = (c) => `<li><strong>${esc(T.xName)} = ${esc(T.xs[c.i])}, ${esc(T.fName)} = ${esc(T.fs[c.j])}</strong>: ${T.counts[c.i][c.j].toLocaleString('en-US')} observed against ${fix(chi.expected[c.i][c.j], 1)} expected (adjusted residual ${signed(c.r, 2)}). ${pct(freq.rowProfiles[c.i][c.j])} of this row against ${pct(freq.colMarginal[c.j])} overall.</li>`;
    const warn = chi.minExpected < 1 || chi.smallCells > 0.2 * chi.cellCount
      ? `<aside class="callout callout--warning"><strong>The approximation is doubtful here</strong><p>${chi.smallCells} of ${chi.cellCount} expected counts are below 5 (the smallest is ${fix(chi.minExpected, 2)}). Trust the permutation p-value more than the asymptotic one, or merge sparse categories.</p></aside>`
      : '';
    const decision = reject
      ? `<p>With χ² = ${fmt(chi.stat, 5)} on ${chi.df} degrees of freedom the p-value is <strong>${pFmt(chi.pValue)}</strong>, below α = ${a}. If ${esc(T.xName)} and ${esc(T.fName)} were independent, a table this far from the expected one would be very unlikely, so <strong>we reject independence: the two variables are statistically dependent</strong>. The conditional distribution of ${esc(T.fName)} changes with ${esc(T.xName)}.</p>`
      : `<p>With χ² = ${fmt(chi.stat, 5)} on ${chi.df} degrees of freedom the p-value is <strong>${pFmt(chi.pValue)}</strong>, above α = ${a}. Deviations of this size are common under independence, so <strong>we do not reject independence</strong>: the data are compatible with ${esc(T.xName)} and ${esc(T.fName)} being independent, and the row profiles differ only by sampling noise.</p>`;
    const size = `<p>Cramér's V = ${fix(chi.cramersV, 3)}: the association is <strong>${strength(chi.cramersV, k)}</strong> (Cohen's thresholds 0.1, 0.3, 0.5, divided by √${k} for min(r, c) − 1 = ${k}).</p>`;
    const where = top.length
      ? `<p>The cells that deviate most from independence:</p><ul>${top.map(cellText).join('')}</ul>`
      : '<p>No cell has an adjusted residual beyond ±1.96.</p>';
    $('[data-interpretation]').innerHTML = decision + size + where + warn;
  };

  const renderOverview = () => {
    const a = alpha();
    const rows = L.DATASETS.map((D) => {
      const T = L.contingency(D.records(), D.xs, D.fs);
      const chi = L.chiSquare(T);
      const k = Math.min(T.xs.length, T.fs.length) - 1;
      return `<tr><th scope="row">${esc(D.title)}</th><td>${T.n.toLocaleString('en-US')}</td><td>${T.xs.length} × ${T.fs.length}</td><td>${fmt(chi.stat, 5)}</td><td>${chi.df}</td><td>${pFmt(chi.pValue)}</td><td>${fix(chi.cramersV, 3)} (${strength(chi.cramersV, k)})</td><td>${chi.pValue < a ? '<strong>dependent</strong>' : 'compatible with independence'}</td></tr>`;
    });
    $('[data-overview]').innerHTML = `<div class="table-scroll"><table class="data-table data-table--compact"><thead><tr><th scope="col">Dataset</th><th scope="col">n</th><th scope="col">r × c</th><th scope="col">χ²</th><th scope="col">ν</th><th scope="col">p-value</th><th scope="col">Cramér's V</th><th scope="col">Decision at α = ${a}</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  };

  const renderScale = (S) => {
    const { T } = S;
    const a = alpha();
    const factors = [0.1, 0.25, 0.5, 1, 2, 5, 10];
    const crit = L.chiSquareQuantile(a, L.chiSquare(T).df);
    const rows = factors.map((f) => {
      const scaled = { ...T, counts: T.counts.map((r) => r.map((c) => c * f)), rowTotals: T.rowTotals.map((t) => t * f), colTotals: T.colTotals.map((t) => t * f), n: T.n * f };
      const chi = L.chiSquare(scaled);
      return `<tr${f === 1 ? ' class="is-highlight"' : ''}><th scope="row">${f}</th><td>${Math.round(scaled.n).toLocaleString('en-US')}</td><td>${fmt(chi.stat, 4)}</td><td>${fmt(crit, 4)}</td><td>${pFmt(chi.pValue)}</td><td>${fix(chi.cramersV, 3)}</td><td>${chi.pValue < a ? 'reject H₀' : 'do not reject'}</td></tr>`;
    });
    $('[data-scale]').innerHTML = `<div class="table-scroll"><table class="data-table data-table--compact"><thead><tr><th scope="col">factor k</th><th scope="col">n</th><th scope="col">χ²</th><th scope="col">critical value</th><th scope="col">p-value</th><th scope="col">Cramér's V</th><th scope="col">decision at α = ${a}</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="keygen-note">Current dataset, every count multiplied by k (fractional counts are allowed in the formula). The highlighted row is the observed table.</p>`;
  };

  const renderStrata = () => {
    const all = L.endpointRecords();
    const xs = ['Installed', 'Not installed'];
    const fs = ['Clean', 'Infected'];
    const groups = [['Pooled', all], ['Corporate only', all.filter((r) => r[2] === 'Corporate')], ['Home only', all.filter((r) => r[2] === 'Home')]];
    const results = groups.map(([name, recs]) => {
      const T = { ...L.contingency(recs.map(([x, f]) => [x, f]), xs, fs), xName: 'Antivirus', fName: 'Status' };
      return { name, T, freq: L.frequencies(T), chi: L.chiSquare(T) };
    });
    $('[data-strata]').innerHTML = results.map(({ name, T, freq }) => `<div><h4>${name}</h4>${grid(T, {
      cell: (i, j) => `${T.counts[i][j].toLocaleString('en-US')}${j === 1 ? ` <span class="keygen-note">(${pct(freq.rowProfiles[i][j])})</span>` : ''}`,
      rowTotal: { label: 'total', value: (i) => T.rowTotals[i].toLocaleString('en-US') },
      colTotal: { label: 'total', value: (j) => T.colTotals[j].toLocaleString('en-US') },
      corner: T.n.toLocaleString('en-US')
    })}</div>`).join('');
    $('[data-strata-summary]').innerHTML = `<div class="table-scroll"><table class="data-table data-table--compact"><thead><tr><th scope="col">Table</th><th scope="col">infection rate with antivirus</th><th scope="col">without antivirus</th><th scope="col">χ²</th><th scope="col">p-value</th><th scope="col">Cramér's V</th></tr></thead><tbody>${results.map(({ name, freq, chi }) => `<tr><th scope="row">${name}</th><td>${pct(freq.rowProfiles[0][1])}</td><td>${pct(freq.rowProfiles[1][1])}</td><td>${fmt(chi.stat, 4)}</td><td>${pFmt(chi.pValue)}</td><td>${fix(chi.cramersV, 3)}</td></tr>`).join('')}</tbody></table></div>`;
  };

  // ---------------------------------------------------------------- wiring
  let permSeed = 7;
  const renderAll = () => {
    current = loadDataset();
    Object.assign(current, analyse(current.T));
    renderData(current);
    renderTables(current);
    renderChi(current);
    renderPerm(current, permSeed);
    interpretation(current);
    renderScale(current);
    renderOverview();
  };

  // The button always builds the table from the pasted data, then shows the result.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    $('[name="dataset"]', form).value = 'custom';
    renderAll();
    if ($('[data-data-error]').hidden) $('#table-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('[name="dataset"]', form).addEventListener('change', renderAll);
  $('[name="alpha"]', form).addEventListener('change', () => {
    renderChi(current);
    renderPerm(current, permSeed);
    interpretation(current);
    renderScale(current);
    renderOverview();
  });
  $('[data-perm-run]').addEventListener('click', () => { permSeed += 1; renderPerm(current, permSeed); });

  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - lastWidth) < 80) return;
    lastWidth = window.innerWidth;
    profileChart($('[data-chart="profiles"]'), current.T, current.freq);
    renderChi(current);
    renderPerm(current, permSeed);
  });

  // A link such as index.html#dataset=ids opens the page on that dataset.
  const fromHash = /dataset=([a-z]+)/.exec(window.location.hash);
  if (fromHash && $(`[name="dataset"] option[value="${fromHash[1]}"]`, form)) $('[name="dataset"]', form).value = fromHash[1];

  renderAll();
  renderStrata();
})();
