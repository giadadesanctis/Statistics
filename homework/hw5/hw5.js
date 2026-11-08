/*
 * Homework 5 page: pictures, convergence charts and tables for Riemann vs Lebesgue integration
 * and for the numerical computation of the normal CDF. Needs integration.js and normal-cdf.js.
 */
(() => {
  const I = window.IntegrationLab;
  const N = window.NormalCdfLab;
  if (!I || !N) return;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const fmt = (v, digits = 3) => {
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) >= 1e6) return v.toExponential(digits - 1).replace('e+', 'e');
    if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-US');
    const r = Number(v.toPrecision(digits));
    return Object.is(r, -0) ? '0' : String(r);
  };
  const sci = (v, digits = 1) => (v === 0 ? '0' : Number.isFinite(v) ? v.toExponential(digits).replace('e+', 'e').replace('e-', 'e−') : '—');
  const tiles = (rows) => rows.map(([label, value, note]) => `<div class="stat-tile"><span class="stat-label">${label}</span><span class="stat-value">${value}</span><span class="stat-note">${note}</span></div>`).join('');
  const table = (head, rows, note = '') => `<div class="table-scroll"><table class="data-table data-table--compact">
    <thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>${note ? `<p class="keygen-note">${note}</p>` : ''}`;

  // Validated categorical order; identity is also given by the legend and the tables.
  const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#e87ba4'];

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
    tooltip.style.left = `${Math.min(event.clientX + 12, window.innerWidth - 220)}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
  };

  const niceTicks = (lo, hi, count = 5) => {
    const raw = (hi - lo) / count;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((f) => f * power).find((s) => s >= raw);
    const ticks = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
    return ticks;
  };
  // Powers of ten, thinned so that a wide range keeps about six labels.
  const logTicks = (lo, hi) => {
    const first = Math.ceil(Math.log10(lo) - 1e-9);
    const last = Math.floor(Math.log10(hi) + 1e-9);
    const step = Math.max(1, Math.ceil((last - first) / 6));
    const ticks = [];
    for (let e = first; e <= last; e += step) ticks.push(10 ** e);
    return ticks;
  };
  const tickText = (v, log) => (log && (v >= 1e4 || v < 1e-2) ? `1e${Math.round(Math.log10(v))}`.replace('-', '−') : fmt(v));

  const frame = (container, { x0, x1, y0, y1, logX = false, logY = false, xTicks, xLabel, yLabel }) => {
    container.innerHTML = '';
    const wide = container.clientWidth > 640;
    const width = wide ? 900 : 560;
    const height = wide ? 300 : 250;
    const plot = { x: 60, y: 14, w: width - 74, h: height - 56 };
    const tx = (v) => (logX ? Math.log10(v) : v);
    const ty = (v) => (logY ? Math.log10(v) : v);
    const sx = (v) => plot.x + ((tx(v) - tx(x0)) / (tx(x1) - tx(x0))) * plot.w;
    const sy = (v) => plot.y + plot.h - ((ty(v) - ty(y0)) / (ty(y1) - ty(y0))) * plot.h;
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' }, container);
    const axis = el('g', { class: 'chart-axis' }, svg);
    (logY ? logTicks(y0, y1) : niceTicks(y0, y1, 4)).forEach((v) => {
      el('line', { x1: plot.x, x2: plot.x + plot.w, y1: sy(v), y2: sy(v), class: 'chart-gridline' }, axis);
      el('text', { x: plot.x - 8, y: sy(v) + 4, 'text-anchor': 'end' }, axis).textContent = tickText(v, logY);
    });
    el('line', { x1: plot.x, x2: plot.x + plot.w, y1: plot.y + plot.h, y2: plot.y + plot.h, class: 'chart-baseline' }, axis);
    (xTicks || (logX ? logTicks(x0, x1) : niceTicks(x0, x1, wide ? 8 : 5))).forEach((v) => {
      el('text', { x: sx(v), y: plot.y + plot.h + 16, 'text-anchor': 'middle' }, axis).textContent = tickText(v, logX);
    });
    el('text', { x: plot.x + plot.w / 2, y: height - 4, 'text-anchor': 'middle', class: 'chart-label' }, axis).textContent = xLabel;
    el('text', { x: 12, y: plot.y + plot.h / 2, 'text-anchor': 'middle', class: 'chart-label', transform: `rotate(-90 12 ${plot.y + plot.h / 2})` }, axis).textContent = yLabel;
    const id = `clip-${Math.random().toString(36).slice(2)}`;
    el('rect', { x: plot.x, y: plot.y, width: plot.w, height: plot.h }, el('clipPath', { id }, el('defs', {}, svg)));
    return { svg, g: el('g', { 'clip-path': `url(#${id})` }, svg), sx, sy, plot };
  };

  // Lines with markers on one shared scale. Values that are not positive (exact results) are
  // left out of log charts. Hovering shows the point nearest to the pointer.
  const lineChart = (container, { series, logX = false, logY = false, xLabel, yLabel, y1Cap = Infinity, xTicks, xFormat = fmt }) => {
    const keep = (x, y) => Number.isFinite(y) && (!logY || y > 0) && (!logX || x > 0);
    const clean = series.map((s) => ({ ...s, pts: s.xs.map((x, i) => [x, s.ys[i]]).filter(([x, y]) => keep(x, y)) }));
    const pts = clean.flatMap((s) => s.pts);
    if (!pts.length) { container.innerHTML = '<p class="keygen-note">Every error is at rounding level.</p>'; return; }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    let y0 = Math.min(...ys);
    let y1 = Math.min(y1Cap, Math.max(...ys));
    if (logY) { y0 = Math.max(y0 / 3, 1e-18); y1 *= 3; } else { const pad = (y1 - y0) * 0.06 || 1; y0 -= pad; y1 += pad; }
    const { svg, g, sx, sy, plot } = frame(container, { x0: logX ? xMin / 1.2 : xMin, x1: logX ? xMax * 1.2 : xMax, y0, y1, logX, logY, xLabel, yLabel, xTicks });
    const drawn = [];
    clean.forEach((s) => {
      el('path', { d: s.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(''), class: 'chart-line', stroke: s.color, ...(s.dash ? { 'stroke-dasharray': s.dash } : {}) }, g);
      s.pts.forEach(([x, y]) => {
        if (s.markers !== false) el('circle', { cx: sx(x), cy: sy(y), r: 3.5, class: 'chart-dot', fill: s.color }, g);
        drawn.push({ x, y, name: s.name, px: sx(x), py: sy(y) });
      });
    });
    const hit = el('rect', { x: plot.x, y: plot.y, width: plot.w, height: plot.h, class: 'chart-hit' }, svg);
    hit.addEventListener('pointermove', (event) => {
      const box = svg.getBoundingClientRect();
      const scale = svg.viewBox.baseVal.width / box.width;
      const mx = (event.clientX - box.left) * scale;
      const my = (event.clientY - box.top) * scale;
      const best = drawn.reduce((a, b) => (Math.hypot(a.px - mx, a.py - my) <= Math.hypot(b.px - mx, b.py - my) ? a : b));
      showTip(event, `<strong>${best.name}</strong><br>${xLabel}: ${xFormat(best.x)}<br>${yLabel}: ${sci(best.y, 2)}`);
    });
    hit.addEventListener('pointerleave', () => { tooltip.hidden = true; });
    if (clean.length > 1) {
      const legend = document.createElement('div');
      legend.className = 'chart-legend';
      legend.innerHTML = clean.map((s) => `<span class="chart-legend-item"><span class="chart-swatch" style="background:${s.color}"></span>${s.name}</span>`).join('');
      container.prepend(legend);
    }
  };

  // ================================================================ Exercise 1: picture
  const lab = $('[data-int-lab]');
  const fnById = (id) => I.FUNCTIONS.find((F) => F.id === id);
  const spacingOf = (F) => (F.unbounded ? 'geometric' : 'uniform');

  const drawPictures = () => {
    const F = fnById($('[name="fn"]', lab).value);
    const n = Number($('[name="n"]', lab).value);
    const K = Number($('[name="K"]', lab).value);
    $('[data-n-out]', lab).textContent = n;
    $('[data-k-out]', lab).textContent = K;
    const riemann = I.riemannMidpoint(F.f, F.a, F.b, n);
    const lebesgue = I.lebesgueExact(F.f, F.a, F.b, K, { spacing: spacingOf(F), unbounded: !!F.unbounded });

    const yMax = F.unbounded ? 6 : Math.max(...Array.from({ length: 801 }, (_, i) => F.f(F.a + ((F.b - F.a) * (i + 0.5)) / 801))) * 1.08;
    const curveXs = Array.from({ length: 600 }, (_, i) => F.a + ((F.b - F.a) * (i + 0.5)) / 600);
    const curve = (g, sx, sy) => el('path', { d: curveXs.map((x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(Math.min(yMax * 1.05, F.f(x))).toFixed(1)}`).join(''), class: 'chart-reference' }, g);
    const options = { x0: F.a, x1: F.b, y0: 0, y1: yMax, xLabel: 'x', yLabel: 'f(x)' };

    // Riemann: one rectangle per cell of the domain, height f(midpoint).
    {
      const { g, sx, sy } = frame($('[data-pic="riemann"]'), options);
      const h = (F.b - F.a) / n;
      for (let i = 0; i < n; i += 1) {
        const x = F.a + i * h;
        const y = Math.min(yMax, F.f(x + h / 2));
        el('rect', { x: sx(x) + 0.5, y: sy(y), width: Math.max(1, sx(x + h) - sx(x) - 1), height: sy(0) - sy(y), class: 'chart-bar', 'fill-opacity': 0.55 }, g);
      }
      curve(g, sx, sy);
    }

    // Lebesgue: every band of values colours its preimage, at the height of the band's midpoint.
    {
      const { g, sx, sy } = frame($('[data-pic="lebesgue"]'), options);
      const { levels } = lebesgue;
      const cells = 1600;
      const width = (F.b - F.a) / cells;
      const bandOf = (y) => {
        let j = 0;
        while (j < K - 1 && y >= levels[j + 1]) j += 1;
        return j;
      };
      let start = 0;
      let band = bandOf(F.f(F.a + width / 2));
      const flush = (end) => {
        const tag = Math.min(yMax, 0.5 * (levels[band] + levels[band + 1]));
        const x0 = F.a + start * width;
        const x1 = F.a + end * width;
        el('rect', { x: sx(x0), y: sy(tag), width: Math.max(0.5, sx(x1) - sx(x0)), height: sy(0) - sy(tag), class: band % 2 ? 'chart-bar--muted' : 'chart-bar', 'fill-opacity': band % 2 ? 0.9 : 0.55 }, g);
      };
      for (let c = 1; c < cells; c += 1) {
        const b = bandOf(F.f(F.a + (c + 0.5) * width));
        if (b !== band) { flush(c); start = c; band = b; }
      }
      flush(cells);
      levels.forEach((y) => { if (y <= yMax) el('line', { x1: sx(F.a), x2: sx(F.b), y1: sy(y), y2: sy(y), class: 'chart-gridline' }, g); });
      curve(g, sx, sy);
    }

    const errR = Math.abs(riemann.value - F.exact);
    const errL = Math.abs(lebesgue.value - F.exact);
    $('[data-pic-tiles]').innerHTML = tiles([
      ['Exact integral', fmt(F.exact, 8), F.label],
      [`Riemann, n = ${n}`, fmt(riemann.value, 8), `error ${sci(errR)}, ${fmt(riemann.evals)} evaluations`],
      [`Lebesgue, K = ${K}`, fmt(lebesgue.value, 8), `error ${sci(errL)}, ${fmt(lebesgue.evals)} evaluations`],
      ['Lebesgue bracket', F.unbounded ? 'unbounded' : `[${fmt(lebesgue.lower, 5)}, ${fmt(lebesgue.upper, 5)}]`, 'lower and upper sums on the same levels']
    ]);
  };

  // ================================================================ Exercise 1: convergence
  const RIEMANN_SIZES = I.oddSizes(5, 1e6);
  const LEBESGUE_SIZES = I.oddSizes(5, 3000);
  const SAMPLES_PER_LEVEL = 10;
  const cache = new Map();

  const convergence = (F) => {
    if (cache.has(F.id)) return cache.get(F.id);
    const riemann = RIEMANN_SIZES.map((n) => I.riemannMidpoint(F.f, F.a, F.b, n));
    const exact = LEBESGUE_SIZES.map((K) => I.lebesgueExact(F.f, F.a, F.b, K, { spacing: spacingOf(F), unbounded: !!F.unbounded }));
    const sampled = LEBESGUE_SIZES.map((K) => I.lebesgueSampled(F.f, F.a, F.b, K, SAMPLES_PER_LEVEL * K));
    const err = (r) => Math.abs(r.value - F.exact);
    const data = {
      riemann: { evals: riemann.map((r) => r.evals), errors: riemann.map(err) },
      exact: { evals: exact.map((r) => r.evals), errors: exact.map(err) },
      sampled: { evals: sampled.map((r) => r.evals), errors: sampled.map(err) }
    };
    cache.set(F.id, data);
    return data;
  };

  const drawConvergence = () => {
    const F = fnById($('[name="fn"]', lab).value);
    const data = convergence(F);
    lineChart($('[data-chart="conv"]'), {
      series: [
        { name: 'Riemann midpoint', color: COLORS[0], xs: data.riemann.evals, ys: data.riemann.errors },
        { name: 'Lebesgue, exact preimages', color: COLORS[1], xs: data.exact.evals, ys: data.exact.errors },
        { name: `Lebesgue, sampled (N = ${SAMPLES_PER_LEVEL}K)`, color: COLORS[2], xs: data.sampled.evals, ys: data.sampled.errors, dash: '6 4' }
      ],
      logX: true,
      logY: true,
      xLabel: 'function evaluations',
      yLabel: 'absolute error'
    });
  };

  const timePerCall = (fn) => {
    const t0 = performance.now();
    let calls = 0;
    let elapsed = 0;
    do { fn(); calls += 1; elapsed = performance.now() - t0; } while (elapsed < 12);
    return (elapsed / calls) * 1000; // microseconds
  };

  // Cost of the first size in the sequence after which the error stays below tol.
  const evalsToReach = (data, tol) => {
    let index = data.errors.length;
    while (index > 0 && data.errors[index - 1] <= tol) index -= 1;
    return index < data.errors.length ? data.evals[index] : Infinity;
  };

  const orderCell = (sizes, errors) => {
    const s = I.slope(sizes, errors);
    return Number.isFinite(s) ? fmt(-s, 3) : 'exact';
  };

  const drawSummary = () => {
    const tol = 1e-3;
    const size = 1001;
    const rows = I.FUNCTIONS.map((F) => {
      const data = convergence(F);
      const timeR = timePerCall(() => I.riemannMidpoint(F.f, F.a, F.b, size));
      const timeL = timePerCall(() => I.lebesgueExact(F.f, F.a, F.b, size, { spacing: spacingOf(F), unbounded: !!F.unbounded }));
      return `<tr><th scope="row">${F.label}</th>
        <td>${fmt(F.exact, 7)}</td>
        <td>${orderCell(RIEMANN_SIZES, data.riemann.errors)}</td>
        <td>${orderCell(LEBESGUE_SIZES, data.exact.errors)}</td>
        <td>${orderCell(LEBESGUE_SIZES, data.sampled.errors)}</td>
        <td>${fmt(evalsToReach(data.riemann, tol))}</td>
        <td>${fmt(evalsToReach(data.exact, tol))}</td>
        <td>${fmt(evalsToReach(data.sampled, tol))}</td>
        <td>${fmt(timeR, 2)}</td>
        <td>${fmt(timeL, 3)}</td></tr>`;
    });
    $('[data-summary]').innerHTML = table(
      ['f', 'exact', 'order R', 'order L exact', 'order L sampled', 'evals R', 'evals L exact', 'evals L sampled', 'time R (µs)', 'time L (µs)'],
      rows,
      'Order: minus the slope of log(error) against log(n or K), over the sizes where the error is above rounding level ("exact": the error is at rounding level for every size). Evals: first size of the sequence after which the error stays below 10⁻³. A dash means that the largest size tried (K = 3001, N = 30,010) did not get there. Time: one integral with n = K = 1001, in this browser.'
    );

    // The singular case in detail.
    const F = fnById('invSqrt');
    const sizes = [11, 101, 1001, 3001];
    $('[data-singular]').innerHTML = table(
      ['n or K', 'Riemann midpoint', 'Lebesgue, uniform levels', 'Lebesgue, geometric levels'],
      sizes.map((s) => `<tr><th scope="row">${fmt(s)}</th>
        <td>${sci(Math.abs(I.riemannMidpoint(F.f, 0, 1, s).value - 2))}</td>
        <td>${sci(Math.abs(I.lebesgueExact(F.f, 0, 1, s, { unbounded: true }).value - 2))}</td>
        <td>${sci(Math.abs(I.lebesgueExact(F.f, 0, 1, s, { unbounded: true, spacing: 'geometric' }).value - 2))}</td></tr>`),
      'Absolute errors for the integral of 1/√x on (0, 1], whose value is 2.'
    );
  };

  // ================================================================ Exercise 1: pathological functions
  const drawPathological = () => {
    // Dirichlet: tags are symbolic, because every double is rational.
    const dirichletTag = {
      rational: () => 1, // the tag i/n is rational
      irrational: () => 0, // the tag (i + 1/sqrt 2)/n is irrational
      mixed: () => (Math.random() < 1 / 3 ? 1 : 0) // a third of the cells get a rational tag
    };
    const dirichlet = (n, tag) => { let s = 0; for (let i = 0; i < n; i += 1) s += dirichletTag[tag](); return s / n; };
    $('[data-dirichlet]').innerHTML = table(
      ['n', 'rational tags', 'irrational tags', 'one third rational', 'upper sum', 'lower sum', 'Lebesgue'],
      [10, 1000, 100000].map((n) => `<tr><th scope="row">${fmt(n)}</th><td>${dirichlet(n, 'rational')}</td><td>${dirichlet(n, 'irrational')}</td><td>${fmt(dirichlet(n, 'mixed'), 3)}</td><td>1</td><td>0</td><td>0</td></tr>`)
    );

    $('[data-thomae]').innerHTML = table(
      ['n', 'left tags i/n', 'midpoint tags', 'upper sum U<sub>n</sub>', 'U<sub>n</sub>·√n', 'lower sum', 'Lebesgue'],
      [10, 100, 1000, 10000, 100000].map((n) => {
        const r = I.thomaeSums(n);
        return `<tr><th scope="row">${fmt(n)}</th><td>${sci(r.left, 2)}</td><td>${sci(r.mid, 2)}</td><td>${sci(r.upper, 2)}</td><td>${fmt(r.upper * Math.sqrt(n), 3)}</td><td>0</td><td>0</td></tr>`;
      })
    );
    $('[data-thomae-points]').innerHTML = table(
      ['level t = 1/q', '1/2', '1/3', '1/10', '1/100', '1/1000'],
      [`<tr><th scope="row">points with f(x) ≥ t</th>${[2, 3, 10, 100, 1000].map((q) => `<td>${fmt(I.pointsAtLeast(q))}</td>`).join('')}</tr>`,
        `<tr><th scope="row">measure of that set</th>${[2, 3, 10, 100, 1000].map(() => '<td>0</td>').join('')}</tr>`]
    );

    $('[data-cantor]').innerHTML = table(
      ['n', 'upper sum', 'lower sum', 'midpoint tags', 'random tags', 'Lebesgue'],
      [100, 1000, 10000, 100000, 1000000].map((n) => {
        const r = I.cantorSums(n);
        return `<tr><th scope="row">${n.toLocaleString('en-US')}</th><td>${fmt(r.upper, 5)}</td><td>0</td><td>${fmt(r.mid, 5)}</td><td>${fmt(r.random, 5)}</td><td>0.5</td></tr>`;
      })
    );
  };

  // ================================================================ Exercise 2
  const ref = N.REFERENCE;
  const QOf = (z) => ref.find((r) => r[0] === z)[1];

  const calc = $('[data-calc]');
  const renderCalc = () => {
    const z = Number($('[name="z"]', calc).value);
    if (!Number.isFinite(z)) return;
    const stats = {};
    const value = N.normalCdf(z, stats);
    $('[data-calc-output]').innerHTML = tiles([
      ['Φ(z)', z > 3 ? value.toFixed(15) : value.toPrecision(15), `z = ${z}`],
      ['1 − Φ(z) = Φ(−z)', N.normalCdf(-z).toPrecision(15), 'upper tail, computed directly'],
      ['erf(z/√2)', N.erf(z / Math.SQRT2).toPrecision(15), 'Φ(z) = ½(1 + erf(z/√2))'],
      ['Iterations', String(stats.iterations), Math.abs(z) / Math.SQRT2 < N.ERFC_SWITCH ? 'positive series for erf' : 'continued fraction for erfc']
    ]);
  };

  const drawWebTable = () => {
    const rows = N.WEB_TABLE.map(([z, inside]) => {
      const web = (1 + Number(inside)) / 2;
      const ours = N.normalCdf(z);
      return `<tr><th scope="row">${z}</th><td>${inside}</td><td>${web.toFixed(15)}</td><td>${ours.toFixed(15)}</td><td>${(2 * ours - 1).toFixed(15)}</td><td>${sci(Math.abs(ours - web))}</td></tr>`;
    });
    $('[data-web]').innerHTML = table(
      ['z', 'P(|Z| ≤ z), web table', 'Φ(z) = (1 + P)/2', 'Φ(z), this page', 'P(|Z| ≤ z), this page', '|difference|'],
      rows,
      'The web table prints 15 decimals, so differences of about 10⁻¹⁵ are the rounding of the source.'
    );

    const tail = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 37.5];
    const rel = (v, q) => sci(Math.abs(v - q) / q);
    $('[data-tail]').innerHTML = table(
      ['z', 'Φ(−z), reference (900 digits)', 'erf-based', 'Hastings', 'Simpson, n = 1000', 'positive series'],
      tail.map((z) => {
        const q = QOf(z);
        return `<tr><th scope="row">${z}</th><td>${sci(q, 15)}</td><td>${rel(N.normalCdf(-z), q)}</td><td>${rel(N.hastings(-z), q)}</td><td>${rel(N.simpson(-z, 1000), q)}</td><td>${rel(N.positiveSeries(-z).value, q)}</td></tr>`;
      }),
      'Relative error of the lower tail. A relative error of 1 or more means no correct digit at all.'
    );

    const row = [1, 3, 5, 6, 7, 8, 9, 10].map((z) => {
      const r = N.maclaurin(z);
      const p = N.positiveSeries(z);
      const truth = 1 - QOf(z);
      return `<tr><th scope="row">${z}</th><td>${r.terms}</td><td>${sci(r.largest, 2)}</td><td>${sci(Math.abs(r.value - truth))}</td><td>${p.terms}</td><td>${sci(Math.abs(p.value - truth))}</td></tr>`;
    });
    $('[data-cancel]').innerHTML = table(
      ['z', 'alternating: terms', 'largest term', 'absolute error', 'positive series: terms', 'absolute error'],
      row
    );
  };

  const drawNormalCharts = () => {
    const z = 1.96;
    const truth = 1 - QOf(z);
    const ns = [4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
    lineChart($('[data-chart="quad"]'), {
      series: [
        { name: 'Trapezoid', color: COLORS[0], xs: ns, ys: ns.map((n) => Math.abs(N.trapezoid(z, n) - truth)) },
        { name: 'Simpson', color: COLORS[1], xs: ns, ys: ns.map((n) => Math.abs(N.simpson(z, n) - truth)) }
      ],
      logX: true,
      logY: true,
      xLabel: 'cells n',
      yLabel: 'absolute error at z = 1.96'
    });

    const terms = Array.from({ length: 30 }, (_, i) => 2 * (i + 1));
    const ref6 = 1 - QOf(6);
    lineChart($('[data-chart="series"]'), {
      series: [
        { name: 'z = 1.96', color: COLORS[0], xs: terms, ys: terms.map((t) => Math.abs(N.maclaurinPartial(z, t) - truth)) },
        { name: 'z = 6', color: COLORS[1], xs: terms.concat([70, 80, 90, 100]), ys: terms.concat([70, 80, 90, 100]).map((t) => Math.abs(N.maclaurinPartial(6, t) - ref6)) }
      ],
      logY: true,
      xLabel: 'terms of the alternating series',
      yLabel: 'absolute error'
    });

    const zs = ref.map((r) => r[0]).filter((v) => v <= 12);
    const rel = (method) => zs.map((v) => { const q = QOf(v); return Math.abs(method(-v) - q) / q; });
    lineChart($('[data-chart="tail"]'), {
      series: [
        { name: 'erf-based (this page)', color: COLORS[0], xs: zs, ys: rel((v) => N.normalCdf(v)) },
        { name: 'Hastings (A&S 26.2.17)', color: COLORS[1], xs: zs, ys: rel(N.hastings) },
        { name: 'Simpson, n = 1000', color: COLORS[2], xs: zs, ys: rel((v) => N.simpson(v, 1000)) },
        { name: 'positive series', color: COLORS[3], xs: zs, ys: rel((v) => N.positiveSeries(v).value) }
      ],
      logY: true,
      y1Cap: 10,
      xLabel: 'z (lower tail Φ(−z))',
      yLabel: 'relative error'
    });
  };

  const METHODS = [
    ['Trapezoid, n = 1000', '1000 evaluations of φ', (z) => N.trapezoid(z, 1000)],
    ['Simpson, n = 100', '100 evaluations of φ', (z) => N.simpson(z, 100)],
    ['Simpson, n = 1000', '1000 evaluations of φ', (z) => N.simpson(z, 1000)],
    ['Alternating Maclaurin series', 'terms grow with z²', (z) => N.maclaurin(z).value],
    ['Positive series', 'terms grow with z²', (z) => N.positiveSeries(z).value],
    ['Hastings polynomial', 'constant: 1 exp, 5 products', N.hastings],
    ['erf series + continued fraction', '< 100 iterations', (z) => N.normalCdf(z)]
  ];

  const drawBenchmark = () => {
    const inputs = Array.from({ length: 256 }, (_, i) => -6 + (12 * (i + 0.5)) / 256);
    let sink = 0;
    const rows = METHODS.map(([name, cost, method]) => {
      const t0 = performance.now();
      let calls = 0;
      let elapsed = 0;
      do {
        for (const z of inputs) sink += method(z);
        calls += inputs.length;
        elapsed = performance.now() - t0;
      } while (elapsed < 25);
      let maxAbs = 0;
      let maxRel = 0;
      for (const [z, q] of ref) {
        if (z <= 6) maxAbs = Math.max(maxAbs, Math.abs(method(z) - (1 - q)), Math.abs(method(-z) - q));
        if (z <= 10) maxRel = Math.max(maxRel, Math.abs(method(-z) - q) / q);
      }
      return `<tr><th scope="row">${name}</th><td>${cost}</td><td>${fmt((elapsed / calls) * 1e6, 3)}</td><td>${sci(maxAbs)}</td><td>${sci(maxRel)}</td></tr>`;
    });
    void sink; // keeps the results of the timed calls alive
    $('[data-bench]').innerHTML = table(
      ['method', 'cost', 'time per call (ns)', 'max absolute error, |z| ≤ 6', 'max relative error of Φ(−z), 0 < z ≤ 10'],
      rows,
      'Times measured in this browser, for z spread over [−6, 6]. Errors against the 900-digit reference.'
    );
  };

  // ---------------------------------------------------------------- wiring
  const update = () => { drawPictures(); drawConvergence(); };
  lab.addEventListener('input', drawPictures);
  $('[name="fn"]', lab).addEventListener('change', update);
  lab.addEventListener('submit', (event) => { event.preventDefault(); });

  calc.addEventListener('submit', (event) => { event.preventDefault(); renderCalc(); });
  $('[data-bench-run]').addEventListener('click', drawBenchmark);

  update();
  renderCalc();
  drawWebTable();
  drawNormalCharts();
  // The heavier tables run after the first paint.
  setTimeout(() => { drawSummary(); drawPathological(); drawBenchmark(); }, 30);
})();
