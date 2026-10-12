/*
 * Homework 1 page: toy public key generator, slowed-down visualisation and
 * statistical exploration on the toy curve. Needs ecc.js and visualizer.js.
 */
(() => {
  const { ECC, ToyVisualizer } = window;
  if (!ECC) return;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const toy = ECC.TOY_CURVE;
  const p = Number(toy.p);
  const BITS = 5; // coordinates go from 0 to 16

  // Every point of the curve with the size of the subgroup it generates.
  const basePoints = ECC.enumeratePoints(toy)
    .map((point) => ({ point, order: Number(ECC.pointOrder(toy, point)) }))
    .sort((a, b) => b.order - a.order || Number(a.point.x - b.point.x) || Number(a.point.y - b.point.y));

  const fillBaseSelect = (select) => {
    select.innerHTML = basePoints
      .map(({ point, order }, index) => `<option value="${index}"${ECC.equals(point, toy.G) ? ' selected' : ''}>G = ${ECC.formatPoint(point)} · order ${order}</option>`)
      .join('');
  };

  // ------------------------------------------------- generate the toy key
  const keyForm = $('[data-toy-form]');
  if (keyForm) {
    const baseSelect = $('[data-toy-base]', keyForm);
    const kInput = $('[data-toy-k]', keyForm);
    const output = $('[data-toy-output]');
    fillBaseSelect(baseSelect);

    const compute = () => {
      const G = basePoints[Number(baseSelect.value)].point;
      const k = BigInt(Math.max(1, Math.round(Number(kInput.value) || 1)));
      const { result, steps, bits } = ECC.scalarMultiply(toy, k, G, { trace: true });
      const fmt = ECC.formatPoint;

      const multiples = k <= 40n
        ? `<ol class="keygen-chips">${ECC.multiplesUpTo(toy, k, G).map(({ k: i, point }) => `<li${i === k ? ' class="is-result"' : ''}><span>${i}G</span><strong>${fmt(point)}</strong></li>`).join('')}</ol>`
        : '<p class="keygen-note">k is larger than 40: the full list is skipped, double-and-add is enough.</p>';

      const opLabel = { start: 'start with G', double: 'double', add: 'add G' };
      const doubleAndAdd = steps.map((step) => `<li>
          <span class="keygen-bit">${step.bit}</span>
          <span class="keygen-op">${opLabel[step.op]}</span>
          <span class="keygen-value">${step.multiple}G = <strong>${fmt(step.result)}</strong></span>
        </li>`).join('');

      output.innerHTML = `
        <div class="keygen-result">
          <span class="keygen-label">Toy public key</span>
          <span class="keygen-key">Q = ${k}G = ${fmt(result)}</span>
          <span class="keygen-meta">private key k = ${k} · base point G = ${fmt(G)} · order ${ECC.pointOrder(toy, G)}</span>
        </div>
        <div class="keygen-block">
          <p class="keygen-title">Repeated addition: G, 2G, …, kG</p>
          ${multiples}
        </div>
        <div class="keygen-block">
          <p class="keygen-title">Double-and-add: k = ${bits}<sub>2</sub>, ${steps.length} operations</p>
          <ol class="keygen-steps">${doubleAndAdd}</ol>
        </div>`;
    };

    keyForm.addEventListener('submit', (event) => {
      event.preventDefault();
      compute();
    });
    baseSelect.addEventListener('change', compute);
    compute();
  }

  // ------------------------------------------------------------ visualiser
  const vizContainer = $('[data-ecc-visualizer]');
  if (vizContainer && ToyVisualizer) ToyVisualizer.create(vizContainer, { k: 6 });

  // ---------------------------------------------------------------- charts
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.hidden = true;
  document.body.append(tooltip);

  const el = (name, attributes = {}, parent = null) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (parent) parent.append(element);
    return element;
  };

  // Column chart. data: [{ label, value, tip }]; `reference` draws a horizontal line.
  const barChart = (container, { data, yMax, yFormat = String, xLabel, yLabel, reference, referenceLabel }) => {
    container.innerHTML = '';
    const width = 560;
    const height = 250;
    const plot = { x: 46, y: 14, w: width - 60, h: height - 56 };
    const sy = (value) => plot.y + plot.h - (value / yMax) * plot.h;
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' }, container);
    const axis = el('g', { class: 'chart-axis' }, svg);
    for (let i = 0; i <= 4; i += 1) {
      const value = (yMax / 4) * i;
      el('line', { x1: plot.x, x2: plot.x + plot.w, y1: sy(value), y2: sy(value), class: i === 0 ? 'chart-baseline' : 'chart-gridline' }, axis);
      el('text', { x: plot.x - 8, y: sy(value) + 4, 'text-anchor': 'end' }, axis).textContent = yFormat(value);
    }
    el('text', { x: plot.x + plot.w / 2, y: height - 4, 'text-anchor': 'middle', class: 'chart-label' }, axis).textContent = xLabel;
    el('text', { x: 12, y: plot.y + plot.h / 2, 'text-anchor': 'middle', class: 'chart-label', transform: `rotate(-90 12 ${plot.y + plot.h / 2})` }, axis).textContent = yLabel;

    const band = plot.w / data.length;
    const barWidth = Math.min(24, band - 4);
    data.forEach((d, i) => {
      const cx = plot.x + band * i + band / 2;
      const top = sy(Math.min(d.value, yMax));
      if (d.value > 0) el('rect', { x: cx - barWidth / 2, y: top, width: barWidth, height: plot.y + plot.h - top, rx: 3, class: 'chart-bar' }, svg);
      el('text', { x: cx, y: plot.y + plot.h + 16, 'text-anchor': 'middle', class: 'chart-tick' }, svg).textContent = d.label;
      const hit = el('rect', { x: plot.x + band * i, y: plot.y, width: band, height: plot.h, class: 'chart-hit' }, svg);
      hit.addEventListener('pointermove', (event) => {
        tooltip.innerHTML = d.tip;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8)}px`;
        tooltip.style.top = `${event.clientY - tooltip.offsetHeight - 12}px`;
      });
      hit.addEventListener('pointerleave', () => { tooltip.hidden = true; });
    });
    el('line', { x1: plot.x, x2: plot.x + plot.w, y1: sy(reference), y2: sy(reference), class: 'chart-reference' }, svg);
    el('text', { x: plot.x + plot.w, y: sy(reference) - 6, 'text-anchor': 'end', class: 'chart-reference-label' }, svg).textContent = referenceLabel;
  };

  // ------------------------------------------------------------ statistics
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

  const pearson = (xs, ys) => {
    const mx = mean(xs);
    const my = mean(ys);
    let cov = 0;
    let sx = 0;
    let sy = 0;
    xs.forEach((x, i) => {
      cov += (x - mx) * (ys[i] - my);
      sx += (x - mx) ** 2;
      sy += (ys[i] - my) ** 2;
    });
    return sx && sy ? cov / Math.sqrt(sx * sy) : NaN;
  };

  const popcount = (value) => value.toString(2).split('').filter((bit) => bit === '1').length;

  // Q = kG for every valid private key k = 1, ..., order - 1.
  const analyse = (G, order) => {
    const rows = ECC.multiplesUpTo(toy, BigInt(order - 1), G).map(({ k, point }) => ({ k: Number(k), x: Number(point.x), y: Number(point.y) }));
    const count = (key) => {
      const counts = new Array(p).fill(0);
      rows.forEach((row) => { counts[row[key]] += 1; });
      return counts;
    };
    const onesShare = (key, bit) => rows.filter((row) => (row[key] >> bit) & 1).length / rows.length;

    // Avalanche: flip one bit of k (staying in 1..order-1), count changed bits of x || y.
    const keyBits = (order - 1).toString(2).length;
    const distances = [];
    rows.forEach((row) => {
      for (let bit = 0; bit < keyBits; bit += 1) {
        const other = rows[(row.k ^ (1 << bit)) - 1];
        if (other) distances.push(popcount(((row.x ^ other.x) << BITS) | (row.y ^ other.y)));
      }
    });

    return {
      rows,
      xCounts: count('x'),
      yCounts: count('y'),
      bitShares: ['x', 'y'].flatMap((key) => [4, 3, 2, 1, 0].map((bit) => ({ label: `${key}${bit}`, value: onesShare(key, bit) }))),
      corrX: pearson(rows.map((r) => r.k), rows.map((r) => r.x)),
      corrY: pearson(rows.map((r) => r.k), rows.map((r) => r.y)),
      avalanche: distances.length ? mean(distances) / (2 * BITS) : NaN
    };
  };

  const stats = $('[data-stats]');
  if (stats) {
    const select = $('select', stats);
    fillBaseSelect(select);
    const fmt = (value) => (Number.isFinite(value) ? value.toFixed(2) : '—');

    const draw = () => {
      const { point: G, order } = basePoints[Number(select.value)];
      const a = analyse(G, order);
      const keys = a.rows.length;
      const uniform = keys / p;

      const coordinateBars = (counts, name) => counts.map((value, label) => ({ label, value, tip: `<strong>${name} = ${label}</strong>${value} of ${keys} public keys` }));
      const yMax = Math.max(2, ...a.xCounts, ...a.yCounts);
      barChart($('[data-chart="x"]', stats), { data: coordinateBars(a.xCounts, 'x'), yMax, xLabel: 'x coordinate of Q', yLabel: 'count', reference: uniform, referenceLabel: `uniform: ${uniform.toFixed(2)}` });
      barChart($('[data-chart="y"]', stats), { data: coordinateBars(a.yCounts, 'y'), yMax, xLabel: 'y coordinate of Q', yLabel: 'count', reference: uniform, referenceLabel: `uniform: ${uniform.toFixed(2)}` });
      barChart($('[data-chart="bits"]', stats), {
        data: a.bitShares.map((d) => ({ ...d, tip: `<strong>bit ${d.label}</strong>${(d.value * 100).toFixed(0)}% ones` })),
        yMax: 1,
        yFormat: (v) => `${Math.round(v * 100)}%`,
        xLabel: 'bit',
        yLabel: 'share of ones',
        reference: 0.5,
        referenceLabel: '50%'
      });

      $('[data-uniformity]', stats).innerHTML = [
        ['Public keys', keys],
        ['Distinct points', new Set(a.rows.map((r) => `${r.x},${r.y}`)).size],
        ['Distinct x', `${a.xCounts.filter(Boolean).length} / ${p}`],
        ['Distinct y', `${a.yCounts.filter(Boolean).length} / ${p}`]
      ].map(([label, value]) => `<div class="stat-tile"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`).join('');

      $('[data-correlation]', stats).innerHTML = [
        ['Pearson(k, x)', fmt(a.corrX)],
        ['Pearson(k, y)', fmt(a.corrY)],
        ['Avalanche', `${Number.isFinite(a.avalanche) ? (a.avalanche * 100).toFixed(0) : '—'}%`]
      ].map(([label, value]) => `<div class="stat-tile"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`).join('');

      $('[data-table]', stats).innerHTML = `<details class="chart-table"><summary>Show all public keys</summary><div class="table-scroll"><table class="data-table data-table--compact">
        <thead><tr><th scope="col">k</th><th scope="col">Q = kG</th><th scope="col">x (binary)</th><th scope="col">y (binary)</th><th scope="col">mirror key ${order} − k</th><th scope="col">mirror point</th></tr></thead>
        <tbody>${a.rows.map((row) => {
          const mirror = a.rows[order - row.k - 1];
          return `<tr><td>${row.k}</td><td>(${row.x}, ${row.y})</td><td>${row.x.toString(2).padStart(BITS, '0')}</td><td>${row.y.toString(2).padStart(BITS, '0')}</td><td>${order - row.k}</td><td>(${mirror.x}, ${mirror.y})</td></tr>`;
        }).join('')}</tbody>
      </table></div></details>`;
    };

    select.addEventListener('change', draw);
    draw();
  }
})();
