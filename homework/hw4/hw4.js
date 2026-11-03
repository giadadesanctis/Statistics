/*
 * Homework 4 page: Welford's recurrences step by step, their numerical stability, and the
 * sampling mean and variance of m hackers over n systems. Needs welford.js.
 */
(() => {
  const W = window.WelfordLab;
  if (!W) return;

  const NS = [2, 5, 10, 30, 100, 1000];
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const fmt = (v, digits = 3) => {
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) >= 1e6) return v.toExponential(digits - 1);
    if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-US');
    const r = Number(v.toPrecision(digits));
    return Object.is(r, -0) ? '0' : String(r);
  };

  // ---------------------------------------------------------------- charts
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const el = (name, attributes = {}, parent = null) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (parent) parent.append(element);
    return element;
  };

  const niceTicks = (lo, hi, count = 5) => {
    const raw = (hi - lo) / count;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((f) => f * power).find((s) => s >= raw);
    const ticks = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
    return ticks;
  };
  const logTicks = (lo, hi) => {
    const ticks = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e += 1) {
      [1, 2, 5].forEach((f) => { const t = f * 10 ** e; if (t >= lo && t <= hi) ticks.push(t); });
    }
    return ticks;
  };

  // Axes for x in [x0, x1] and y in [y0, y1], each optionally log10. Full-width charts get a
  // wider viewBox, so that text keeps the same size as in half-width charts.
  const frame = (container, { x0, x1, y0, y1, logX = false, logY = false, xTicks, xLabel, yLabel }) => {
    container.innerHTML = '';
    const wide = container.clientWidth > 640;
    const width = wide ? 900 : 560;
    const height = wide ? 280 : 250;
    const plot = { x: 56, y: 14, w: width - 70, h: height - 56 };
    const tx = (v) => (logX ? Math.log10(v) : v);
    const ty = (v) => (logY ? Math.log10(v) : v);
    const sx = (v) => plot.x + ((tx(v) - tx(x0)) / (tx(x1) - tx(x0))) * plot.w;
    const sy = (v) => plot.y + plot.h - ((ty(v) - ty(y0)) / (ty(y1) - ty(y0))) * plot.h;
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' }, container);
    const axis = el('g', { class: 'chart-axis' }, svg);
    (logY ? logTicks(y0, y1) : niceTicks(y0, y1, 4)).forEach((v) => {
      el('line', { x1: plot.x, x2: plot.x + plot.w, y1: sy(v), y2: sy(v), class: 'chart-gridline' }, axis);
      el('text', { x: plot.x - 8, y: sy(v) + 4, 'text-anchor': 'end' }, axis).textContent = fmt(v);
    });
    el('line', { x1: plot.x, x2: plot.x + plot.w, y1: plot.y + plot.h, y2: plot.y + plot.h, class: 'chart-baseline' }, axis);
    (xTicks || niceTicks(x0, x1, wide ? 8 : 5)).forEach((v) => {
      el('text', { x: sx(v), y: plot.y + plot.h + 16, 'text-anchor': 'middle' }, axis).textContent = fmt(v);
    });
    el('text', { x: plot.x + plot.w / 2, y: height - 4, 'text-anchor': 'middle', class: 'chart-label' }, axis).textContent = xLabel;
    el('text', { x: 12, y: plot.y + plot.h / 2, 'text-anchor': 'middle', class: 'chart-label', transform: `rotate(-90 12 ${plot.y + plot.h / 2})` }, axis).textContent = yLabel;
    const id = `clip-${Math.random().toString(36).slice(2)}`;
    el('rect', { x: plot.x, y: plot.y, width: plot.w, height: plot.h }, el('clipPath', { id }, el('defs', {}, svg)));
    return { svg, g: el('g', { 'clip-path': `url(#${id})` }, svg), sx, sy, plot };
  };
  const pathOf = (xs, ys, sx, sy) => xs.map((x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join('');

  // Running statistic of the first hackers against k, with the theoretical mean and +-2 sd band.
  const trajectoryChart = (container, { ks, lines, band, yLabel, floor = -Infinity }) => {
    const all = lines.flat().concat(band.flatMap((b) => [b.mean - 2 * b.sd, b.mean + 2 * b.sd]));
    let y0 = Math.max(floor, Math.min(...all));
    let y1 = Math.max(...all);
    const pad = (y1 - y0) * 0.05 || 1;
    y0 = Math.max(floor, y0 - pad);
    y1 += pad;
    const xTicks = [2, 10, 100, 1000].filter((v) => v <= ks[ks.length - 1]);
    const { g, sx, sy } = frame(container, { x0: ks[0], x1: ks[ks.length - 1], y0, y1, logX: true, xTicks, xLabel: 'systems k (log scale)', yLabel });
    lines.forEach((ys) => el('path', { d: pathOf(ks, ys, sx, sy), class: 'chart-line', stroke: 'var(--color-accent)', 'stroke-opacity': 0.4, 'stroke-width': 1.2 }, g));
    el('path', { d: pathOf(ks, band.map((b) => b.mean), sx, sy), class: 'chart-reference', 'stroke-width': 1.5 }, g);
    [-2, 2].forEach((z) => el('path', { d: pathOf(ks, band.map((b) => b.mean + z * b.sd), sx, sy), class: 'chart-reference', 'stroke-dasharray': '5 4' }, g));
  };

  // Histogram with an optional density curve and vertical reference lines.
  const histogramChart = (container, { bins, curve, lines = [], xLabel }) => {
    const x0 = bins[0].x0;
    const x1 = bins[bins.length - 1].x1;
    const xs = Array.from({ length: 201 }, (_, i) => x0 + ((x1 - x0) * i) / 200);
    const ys = curve ? xs.map(curve) : [];
    const y1 = Math.max(...bins.map((b) => b.density), ...ys) * 1.12;
    const { g, sx, sy } = frame(container, { x0, x1, y0: 0, y1, xLabel, yLabel: 'density' });
    bins.forEach((b) => {
      if (b.density > 0) el('rect', { x: sx(b.x0) + 0.5, y: sy(b.density), width: Math.max(1, sx(b.x1) - sx(b.x0) - 1), height: sy(0) - sy(b.density), class: 'chart-bar' }, g);
    });
    if (curve) el('path', { d: pathOf(xs, ys, sx, sy), class: 'chart-reference' }, g);
    lines.forEach(({ x, label, dashed }, i) => {
      el('line', { x1: sx(x), x2: sx(x), y1: sy(0), y2: sy(y1), class: 'chart-reference', 'stroke-width': 1.5, ...(dashed ? { 'stroke-dasharray': '5 4' } : {}) }, g);
      el('text', { x: sx(x) + 5, y: sy(y1) + 12 + 13 * i, class: 'chart-reference-label' }, g).textContent = label;
    });
  };

  // Bar chart of a pmf on 0..10, or the flat density of the continuous uniform.
  const distributionChart = (container, dist) => {
    const pmf = dist.pmf;
    const y1 = (pmf ? Math.max(...pmf) : 0.1) * 1.15;
    const { g, sx, sy } = frame(container, { x0: -0.5, x1: 10.5, y0: 0, y1, xTicks: [0, 2, 4, 6, 8, 10], xLabel: 'score x', yLabel: pmf ? 'P(X = x)' : 'density' });
    if (pmf) {
      pmf.forEach((q, x) => el('rect', { x: sx(x - 0.35), y: sy(q), width: sx(0.7) - sx(0), height: sy(0) - sy(q), class: 'chart-bar' }, g));
    } else {
      el('rect', { x: sx(0), y: sy(0.1), width: sx(10) - sx(0), height: sy(0) - sy(0.1), class: 'chart-bar', 'fill-opacity': 0.85 }, g);
    }
    el('line', { x1: sx(dist.mu), x2: sx(dist.mu), y1: sy(0), y2: sy(y1), class: 'chart-reference', 'stroke-width': 1.5 }, g);
    el('text', { x: sx(dist.mu) + 5, y: sy(y1) + 12, class: 'chart-reference-label' }, g).textContent = `μ = ${fmt(dist.mu)}`;
  };

  // Empirical points against a theoretical curve, log-log.
  const scalingChart = (container, { ns, empirical, theory, yLabel }) => {
    const xs = Array.from({ length: 100 }, (_, i) => ns[0] * (ns[ns.length - 1] / ns[0]) ** (i / 99));
    const ys = xs.map(theory);
    const all = empirical.concat(ys).filter((v) => v > 0);
    const y0 = Math.min(...all) / 1.4;
    const y1 = Math.max(...all) * 1.4;
    const { g, sx, sy } = frame(container, { x0: ns[0] / 1.3, x1: ns[ns.length - 1] * 1.3, y0, y1, logX: true, logY: true, xTicks: ns, xLabel: 'systems per hacker n (log scale)', yLabel });
    el('path', { d: pathOf(xs, ys, sx, sy), class: 'chart-reference' }, g);
    empirical.forEach((v, i) => { if (v > 0) el('circle', { cx: sx(ns[i]), cy: sy(v), r: 5, class: 'chart-dot', fill: 'var(--color-accent)' }, g); });
  };

  // ================================================================ Exercise 1
  // Step-by-step trace of the recurrences on a user-supplied stream.
  const trace = $('[data-trace]');
  if (trace) {
    const input = $('textarea', trace);
    const output = $('[data-trace-output]', trace);
    const render = () => {
      const values = input.value.split(/[\s,;]+/).filter(Boolean).map(Number).filter(Number.isFinite);
      if (values.length < 2) {
        output.innerHTML = '<p class="keygen-note">Enter at least two numbers.</p>';
        return;
      }
      const w = new W.Welford();
      const rows = values.map((x) => {
        const before = w.mean;
        w.push(x);
        return `<tr><th scope="row">${w.k}</th><td>${fmt(x, 6)}</td><td>${fmt(x - before, 6)}</td><td>${fmt(w.mean, 6)}</td><td>${fmt(x - w.mean, 6)}</td><td>${fmt(w.ss, 6)}</td><td>${fmt(w.variance, 6)}</td></tr>`;
      });
      output.innerHTML = `<div class="table-scroll"><table class="data-table data-table--compact">
        <thead><tr><th scope="col">k</th><th scope="col">x<sub>k</sub></th><th scope="col">x<sub>k</sub> − M<sub>k−1</sub></th><th scope="col">M<sub>k</sub></th><th scope="col">x<sub>k</sub> − M<sub>k</sub></th><th scope="col">S<sub>k</sub></th><th scope="col">s<sub>k</sub>² = S<sub>k</sub>/(k−1)</th></tr></thead>
        <tbody>${rows.join('')}</tbody></table></div>
        <p class="keygen-note">Check with the two-pass formula on the whole list: mean ${fmt(values.reduce((a, b) => a + b, 0) / values.length, 6)}, variance ${fmt(W.twoPassVariance(values), 6)}.</p>`;
    };
    $('form', trace).addEventListener('submit', (event) => { event.preventDefault(); render(); });
    render();
  }

  // Naive one-pass formula vs two-pass vs Welford on shifted data.
  const stability = $('[data-stability]');
  if (stability) {
    const base = [4, 7, 13, 16];
    const offsets = [0, 1e4, 1e6, 1e8, 1e9, 1e10, 1e12];
    const cell = (v) => {
      const ok = Math.abs(v - 30) < 1e-6;
      return `<td${ok ? '' : ' class="is-highlight"'}>${Number.isFinite(v) ? Number(v.toPrecision(10)) : '—'}</td>`;
    };
    const rows = offsets.map((c) => {
      const values = base.map((x) => c + x);
      return `<tr><th scope="row">${c ? `10<sup>${Math.log10(c)}</sup>` : '0'}</th>${cell(W.naiveVariance(values))}${cell(W.twoPassVariance(values))}${cell(W.welfordVariance(values))}</tr>`;
    });
    stability.innerHTML = `<div class="table-scroll"><table class="data-table data-table--compact">
      <thead><tr><th scope="col">offset c</th><th scope="col">naive: (Σx² − (Σx)²/n)/(n−1)</th><th scope="col">two-pass</th><th scope="col">Welford</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table></div>
      <p class="keygen-note">Data c + 4, c + 7, c + 13, c + 16 in double precision: the exact variance is 30 for every c. Highlighted cells are wrong.</p>`;
  }

  // ================================================================ Exercise 2
  // The controls and charts are spread over two cards, so queries are page-wide.
  const section = document;
  const form = $('[data-sim-form]');
  if (!form) return;
  const nSelect = $('[data-n]', section);
  const pInput = $('[name="p"]', form);
  let run = null;

  const distFromForm = () => {
    const name = $('[name="dist"]', form).value;
    const p = Math.min(0.99, Math.max(0.01, Number(pInput.value) || 0.3));
    pInput.disabled = name !== 'binomial';
    const labels = { binomial: `Binomial(10, ${p})`, uniformDiscrete: 'Uniform{0, …, 10}', uniformContinuous: 'Uniform[0, 10]' };
    return { name, label: labels[name], ...W.DISTRIBUTIONS[name](p) };
  };

  const renderTheory = () => {
    const { dist } = run;
    distributionChart($('[data-chart="dist"]', section), dist);
    const kurtosis = dist.mu4 / dist.sigma2 ** 2 - 3;
    $('[data-theory]', section).innerHTML = [
      ['Distribution', dist.label, dist.pmf ? 'discrete scores 0, 1, …, 10' : 'continuous scores in [0, 10]'],
      ['Mean μ', fmt(dist.mu, 4), 'E[X]'],
      ['Variance σ²', fmt(dist.sigma2, 4), 'E[(X − μ)²]'],
      ['Excess kurtosis', fmt(kurtosis, 3), 'μ₄/σ⁴ − 3, enters Var(s²)']
    ].map(([label, value, note]) => `<div class="stat-tile"><span class="stat-label">${label}</span><span class="stat-value">${value}</span><span class="stat-note">${note}</span></div>`).join('');
  };

  const renderTrajectories = () => {
    const { dist, sim } = run;
    const { ks, paths } = sim;
    trajectoryChart($('[data-chart="traj-mean"]', section), {
      ks,
      lines: paths.map((p) => p.mean),
      band: ks.map((k) => ({ mean: dist.mu, sd: Math.sqrt(dist.sigma2 / k) })),
      yLabel: 'running mean M_k',
      floor: 0
    });
    trajectoryChart($('[data-chart="traj-var"]', section), {
      ks,
      lines: paths.map((p) => p.variance),
      band: ks.map((k) => ({ mean: dist.sigma2, sd: Math.sqrt(W.varianceOfS2(dist, k)) })),
      yLabel: 'running variance s²_k',
      floor: 0
    });
  };

  const renderHistograms = () => {
    const { dist, sim } = run;
    const n = Number(nSelect.value);
    const means = sim.means[n];
    const vars = sim.variances[n];
    const sdMean = Math.sqrt(dist.sigma2 / n);
    const avgMean = W.summary(means).mean;
    const avgVar = W.summary(vars).mean;
    histogramChart($('[data-chart="hist-mean"]', section), {
      bins: W.histogram(means, { lo: Math.max(0, dist.mu - 4 * sdMean), hi: Math.min(10, dist.mu + 4 * sdMean), lattice: dist.lattice / n }),
      curve: (x) => W.normalPdf(x, dist.mu, dist.sigma2 / n),
      lines: [{ x: dist.mu, label: `μ = ${fmt(dist.mu)}` }, { x: avgMean, label: `average = ${fmt(avgMean)}`, dashed: true }],
      xLabel: `sampling mean x̄, n = ${fmt(n)}`
    });
    const sorted = Array.from(vars).sort((a, b) => a - b);
    const hi = Math.max(sorted[Math.floor(0.995 * (sorted.length - 1))], dist.sigma2 * 1.5);
    const lo = n >= 30 ? Math.max(0, sorted[Math.floor(0.005 * (sorted.length - 1))]) : 0;
    histogramChart($('[data-chart="hist-var"]', section), {
      bins: W.histogram(vars, { lo, hi, bins: 35 }),
      lines: [{ x: dist.sigma2, label: `σ² = ${fmt(dist.sigma2)}` }, { x: avgVar, label: `average = ${fmt(avgVar)}`, dashed: true }],
      xLabel: `sampling variance s², n = ${fmt(n)}`
    });
  };

  const renderTable = () => {
    const { dist, sim, m } = run;
    const cell = (empirical, theory, digits = 3) => `${fmt(empirical, digits)} <span class="stat-note">(${fmt(theory, digits)})</span>`;
    const stats = NS.map((n) => {
      const means = Array.from(sim.means[n]);
      const vars = Array.from(sim.variances[n]);
      const M = W.summary(means);
      const V = W.summary(vars);
      // Share of hackers whose interval x̄ ± 1.96 s/√n contains μ.
      const covered = means.filter((x, j) => Math.abs(x - dist.mu) <= 1.96 * Math.sqrt(vars[j] / n)).length / m;
      return { n, M, V, covered };
    });
    const rows = stats.map(({ n, M, V, covered }) => `<tr><th scope="row">${fmt(n)}</th>
      <td>${cell(M.mean, dist.mu, 4)}</td>
      <td>${cell(V.mean, dist.sigma2, 4)}</td>
      <td>${cell((V.mean * (n - 1)) / n, (dist.sigma2 * (n - 1)) / n, 4)}</td>
      <td>${cell(M.variance, dist.sigma2 / n)}</td>
      <td>${cell(V.variance, W.varianceOfS2(dist, n))}</td>
      <td>${cell(covered, 0.95)}</td></tr>`);
    $('[data-table]', section).innerHTML = `<div class="table-scroll"><table class="data-table data-table--compact">
      <thead><tr><th scope="col">n</th><th scope="col">average of x̄</th><th scope="col">average of s²</th><th scope="col">average of S<sub>n</sub>/n</th><th scope="col">Var(x̄) across hackers</th><th scope="col">Var(s²) across hackers</th><th scope="col">coverage of x̄ ± 1.96 s/√n</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>
    <p class="keygen-note">Empirical values over m = ${fmt(m)} hackers, theory in parentheses: μ, σ², σ²(n−1)/n, σ²/n, (μ₄ − σ⁴(n−3)/(n−1))/n and the nominal 95%. The average of s² is the same column as S<sub>n</sub>/n multiplied by n/(n−1).</p>`;

    scalingChart($('[data-chart="sd-mean"]', section), {
      ns: NS,
      empirical: stats.map((s) => Math.sqrt(s.M.variance)),
      theory: (n) => Math.sqrt(dist.sigma2 / n),
      yLabel: 'sd of x̄'
    });
    scalingChart($('[data-chart="sd-var"]', section), {
      ns: NS,
      empirical: stats.map((s) => Math.sqrt(s.V.variance)),
      theory: (n) => Math.sqrt(W.varianceOfS2(dist, n)),
      yLabel: 'sd of s²'
    });

    const big = stats[stats.length - 1];
    $('[data-tiles]', section).innerHTML = [
      [`Average of x̄, n = ${fmt(big.n)}`, fmt(big.M.mean, 4), `μ = ${fmt(dist.mu, 4)}, standard error σ/√(mn) = ${fmt(Math.sqrt(dist.sigma2 / (m * big.n)), 2)}`],
      [`Average of s², n = ${fmt(big.n)}`, fmt(big.V.mean, 4), `σ² = ${fmt(dist.sigma2, 4)}`],
      ['Average of s², n = 2', fmt(stats[0].V.mean, 4), `still unbiased; SS/n would give ${fmt(stats[0].V.mean / 2, 4)}`]
    ].map(([label, value, note]) => `<div class="stat-tile"><span class="stat-label">${label}</span><span class="stat-value">${value}</span><span class="stat-note">${note}</span></div>`).join('');
  };

  const simulate = () => {
    const button = $('button', form);
    button.disabled = true;
    setTimeout(() => {
      const dist = distFromForm();
      const m = Number($('[name="m"]', form).value);
      run = { dist, m, sim: W.simulate({ dist, m, ns: NS }) };
      renderTheory();
      renderTrajectories();
      renderHistograms();
      renderTable();
      button.disabled = false;
    }, 20);
  };

  form.addEventListener('submit', (event) => { event.preventDefault(); simulate(); });
  $('[name="dist"]', form).addEventListener('change', simulate);
  nSelect.addEventListener('change', renderHistograms);
  simulate();
})();
