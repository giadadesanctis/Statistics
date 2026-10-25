/*
 * Homework 3 page: trajectories, distributions and convergence of S_n, S_n/n and S_n/sqrt(n)
 * for m attackers over n systems. Needs random-walk.js.
 */
(() => {
  const RW = window.RandomWalk;
  if (!RW) return;

  const NS = [10, 100, 1000, 10000];
  const EPSILON = 0.05;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const fmt = (v) => {
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-US');
    const r = Number(v.toPrecision(3));
    return Object.is(r, -0) ? '0' : String(r);
  };

  // The three quantities: value = S_k / scale(k).
  const QUANTITIES = {
    total: { scale: () => 1 },
    average: { scale: (k) => k },
    normalized: { scale: (k) => Math.sqrt(k) }
  };
  const moments = (model, key, k) => {
    const s = QUANTITIES[key].scale(k);
    return { mean: (k * model.mu) / s, sd: Math.sqrt(k * model.sigma2) / s };
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

  // Axes for x in [x0, x1] (optionally log10) and y in [y0, y1]. Full-width charts get a wider
  // viewBox, so that text keeps the same size as in half-width charts.
  const frame = (container, { x0, x1, y0, y1, logX = false, xLabel, yLabel }) => {
    container.innerHTML = '';
    const wide = container.clientWidth > 640;
    const width = wide ? 900 : 560;
    const height = wide ? 280 : 250;
    const plot = { x: 56, y: 14, w: width - 70, h: height - 56 };
    const tx = (v) => (logX ? Math.log10(v) : v);
    const sx = (v) => plot.x + ((tx(v) - tx(x0)) / (tx(x1) - tx(x0))) * plot.w;
    const sy = (v) => plot.y + plot.h - ((v - y0) / (y1 - y0)) * plot.h;
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' }, container);
    const axis = el('g', { class: 'chart-axis' }, svg);
    niceTicks(y0, y1, 4).forEach((v) => {
      el('line', { x1: plot.x, x2: plot.x + plot.w, y1: sy(v), y2: sy(v), class: 'chart-gridline' }, axis);
      el('text', { x: plot.x - 8, y: sy(v) + 4, 'text-anchor': 'end' }, axis).textContent = fmt(v);
    });
    el('line', { x1: plot.x, x2: plot.x + plot.w, y1: plot.y + plot.h, y2: plot.y + plot.h, class: 'chart-baseline' }, axis);
    const xTicks = logX ? NS.filter((v) => v >= x0 && v <= x1).concat(1).sort((a, b) => a - b) : niceTicks(x0, x1, wide ? 8 : 5);
    xTicks.forEach((v) => { el('text', { x: sx(v), y: plot.y + plot.h + 16, 'text-anchor': 'middle' }, axis).textContent = fmt(v); });
    el('text', { x: plot.x + plot.w / 2, y: height - 4, 'text-anchor': 'middle', class: 'chart-label' }, axis).textContent = xLabel;
    el('text', { x: 12, y: plot.y + plot.h / 2, 'text-anchor': 'middle', class: 'chart-label', transform: `rotate(-90 12 ${plot.y + plot.h / 2})` }, axis).textContent = yLabel;
    // Clip the data to the plot area.
    const id = `clip-${Math.random().toString(36).slice(2)}`;
    el('rect', { x: plot.x, y: plot.y, width: plot.w, height: plot.h }, el('clipPath', { id }, el('defs', {}, svg)));
    return { g: el('g', { 'clip-path': `url(#${id})` }, svg), sx, sy };
  };
  const pathOf = (xs, ys, sx, sy) => xs.map((x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join('');

  const trajectoryChart = (container, { model, key, ks, paths, yLabel }) => {
    const scale = QUANTITIES[key].scale;
    const lines = paths.map((path) => path.map((s, i) => s / scale(ks[i])));
    const band = ks.map((k) => moments(model, key, k));
    const all = lines.flat().concat(band.flatMap((b) => [b.mean - 2 * b.sd, b.mean + 2 * b.sd]));
    let y0 = Math.min(...all);
    let y1 = Math.max(...all);
    const pad = (y1 - y0) * 0.05 || 1;
    y0 -= pad;
    y1 += pad;
    const { g, sx, sy } = frame(container, { x0: 1, x1: ks[ks.length - 1], y0, y1, logX: true, xLabel: 'systems k (log scale)', yLabel });
    lines.forEach((ys) => el('path', { d: pathOf(ks, ys, sx, sy), class: 'chart-line', stroke: 'var(--color-accent)', 'stroke-opacity': 0.4, 'stroke-width': 1.2 }, g));
    el('path', { d: pathOf(ks, band.map((b) => b.mean), sx, sy), class: 'chart-reference', 'stroke-width': 1.5 }, g);
    [-2, 2].forEach((z) => el('path', { d: pathOf(ks, band.map((b) => b.mean + z * b.sd), sx, sy), class: 'chart-reference', 'stroke-dasharray': '5 4' }, g));
  };

  const histogramChart = (container, { bins, curve, xLabel }) => {
    const x0 = bins[0].x0;
    const x1 = bins[bins.length - 1].x1;
    const xs = Array.from({ length: 201 }, (_, i) => x0 + ((x1 - x0) * i) / 200);
    const ys = curve ? xs.map(curve) : [];
    const y1 = Math.max(...bins.map((b) => b.density), ...ys) * 1.08;
    const { g, sx, sy } = frame(container, { x0, x1, y0: 0, y1, xLabel, yLabel: 'density' });
    bins.forEach((b) => {
      if (b.density > 0) el('rect', { x: sx(b.x0) + 0.5, y: sy(b.density), width: Math.max(1, sx(b.x1) - sx(b.x0) - 1), height: sy(0) - sy(b.density), class: 'chart-bar' }, g);
    });
    if (curve) el('path', { d: pathOf(xs, ys, sx, sy), class: 'chart-reference' }, g);
  };

  // ---------------------------------------------------------------- page
  const section = $('[data-sim]');
  if (!section) return;
  const form = $('[data-sim-form]', section);
  const nSelect = $('[data-n]', section);
  const pInput = $('[name="p"]', form);
  let run = null;

  const modelFromForm = () => {
    const name = $('[name="model"]', form).value;
    const p = Math.min(0.99, Math.max(0.01, Number(pInput.value) || 0.3));
    pInput.disabled = name !== 'bernoulli';
    return { name, p, ...RW.MODELS[name](p) };
  };

  const renderHistograms = () => {
    const { model, sim } = run;
    const n = Number(nSelect.value);
    const S = sim.finals[n];
    const sd = Math.sqrt(n * model.sigma2);
    const max = n;
    const min = model.min * n;
    histogramChart($('[data-chart="hist-total"]', section), {
      bins: RW.histogram(S, { model, n, scale: 1, lo: Math.max(min, n * model.mu - 4 * sd), hi: Math.min(max, n * model.mu + 4 * sd) }),
      xLabel: `S_n, n = ${fmt(n)}`
    });
    histogramChart($('[data-chart="hist-average"]', section), {
      bins: RW.histogram(S, { model, n, scale: n, lo: model.min, hi: 1 }),
      xLabel: `S_n / n, n = ${fmt(n)}`
    });
    const { mean, sd: sdNorm } = moments(model, 'normalized', n);
    const r = Math.sqrt(n);
    histogramChart($('[data-chart="hist-normalized"]', section), {
      bins: RW.histogram(S, { model, n, scale: r, lo: Math.max(min / r, mean - 4 * sdNorm), hi: Math.min(max / r, mean + 4 * sdNorm) }),
      curve: (x) => RW.normalPdf(x, mean, sdNorm ** 2),
      xLabel: `S_n / √n, n = ${fmt(n)}`
    });
  };

  const renderTable = () => {
    const { model, sim, m } = run;
    const cell = (empirical, theory) => `${fmt(empirical)} <span class="stat-note">(${fmt(theory)})</span>`;
    const rows = NS.map((n) => {
      const S = Array.from(sim.finals[n]);
      const v = RW.variance(S);
      const far = S.filter((s) => Math.abs(s / n - model.mu) >= EPSILON).length / m;
      const z = S.map((s) => (s - n * model.mu) / Math.sqrt(n * model.sigma2));
      return `<tr><th scope="row">${fmt(n)}</th>
        <td>${cell(RW.mean(S) / n, model.mu)}</td>
        <td>${cell(v, n * model.sigma2)}</td>
        <td>${cell(v / n ** 2, model.sigma2 / n)}</td>
        <td>${cell(v / n, model.sigma2)}</td>
        <td>${cell(far, Math.min(1, model.sigma2 / (n * EPSILON ** 2)))}</td>
        <td>${cell(RW.ksDistance(z), (0.4748 * model.rho) / (model.sigma2 ** 1.5 * Math.sqrt(n)))}</td></tr>`;
    });
    $('[data-table]', section).innerHTML = `<div class="table-scroll"><table class="data-table data-table--compact">
      <thead><tr><th scope="col">n</th><th scope="col">mean of S<sub>n</sub>/n</th><th scope="col">Var(S<sub>n</sub>)</th><th scope="col">Var(S<sub>n</sub>/n)</th><th scope="col">Var(S<sub>n</sub>/√n)</th><th scope="col">P(|S<sub>n</sub>/n − μ| ≥ ${EPSILON})</th><th scope="col">KS distance from N(0,1)</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>
    <p class="keygen-note">Empirical values over m = ${fmt(m)} attackers, theory in parentheses (for the probability, the Chebyshev bound σ²/(nε²); for the KS distance, the Berry–Esseen bound 0.4748ρ/(σ³√n)). The KS distance is computed on the standardized score (S<sub>n</sub> − nμ)/(σ√n), which equals S<sub>n</sub>/√n in the Rademacher case.</p>`;
  };

  const renderTiles = () => {
    const { model, sim, m } = run;
    const n = NS[NS.length - 1];
    const S = Array.from(sim.finals[n]);
    const total = S.reduce((a, b) => a + b, 0);
    const best = Math.max(...S);
    const sigma = Math.sqrt(model.sigma2);
    $('[data-tiles]').innerHTML = [
      ['Aggregate score T, n = 10,000', fmt(total), `expected mnμ = ${fmt(m * n * model.mu)}, sd σ√(mn) = ${fmt(sigma * Math.sqrt(m * n))}`],
      ['Best of the m attackers', fmt(best), `≈ nμ + σ√n·√(2 ln m) = ${fmt(n * model.mu + sigma * Math.sqrt(n) * Math.sqrt(2 * Math.log(Math.max(m, 2))))}`],
      ['Aggregate average T/(mn)', fmt(total / (m * n)), `μ = ${fmt(model.mu)}`]
    ].map(([label, value, note]) => `<div class="stat-tile"><span class="stat-label">${label}</span><span class="stat-value">${value}</span><span class="stat-note">${note}</span></div>`).join('');
  };

  const simulate = () => {
    const button = $('button', form);
    button.disabled = true;
    setTimeout(() => {
      const model = modelFromForm();
      const m = Number($('[name="m"]', form).value);
      const sim = RW.simulate({ model, m, ns: NS });
      run = { model, m, sim };
      const traj = { model, ks: sim.ks, paths: sim.paths };
      trajectoryChart($('[data-chart="traj-total"]', section), { ...traj, key: 'total', yLabel: 'S_k' });
      trajectoryChart($('[data-chart="traj-average"]', section), { ...traj, key: 'average', yLabel: 'S_k / k' });
      trajectoryChart($('[data-chart="traj-normalized"]', section), { ...traj, key: 'normalized', yLabel: 'S_k / √k' });
      renderHistograms();
      renderTable();
      renderTiles();
      button.disabled = false;
    }, 20);
  };

  form.addEventListener('submit', (event) => { event.preventDefault(); simulate(); });
  $('[name="model"]', form).addEventListener('change', simulate);
  nSelect.addEventListener('change', renderHistograms);
  simulate();
})();
