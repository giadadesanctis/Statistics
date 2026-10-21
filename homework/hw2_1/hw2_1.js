/*
 * Homework 2 page: toy EC-ElGamal on secp256k1, the Caesar cipher, the statistical
 * cryptanalysis of Caesar and the attack on the restricted private key.
 * Needs corpus.js, ec-elgamal.js and caesar.js.
 */
(() => {
  const { ECElGamal: EC, Caesar: C, CORPUS } = window;
  if (!EC || !C || !CORPUS) return;

  const KEY_BITS = 20; // toy private key: 1 <= k <= 2^20

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtInt = (value) => Number(value).toLocaleString('en-US');
  const tiles = (container, items) => {
    container.innerHTML = items.map(([label, value, note]) => `<div class="stat-tile"><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${note ? `<span class="stat-note">${note}</span>` : ''}</div>`).join('');
  };
  const step = (title, kind, value, note = '') => `<li class="pipe-step">
      <div class="pipe-head"><strong>${title}</strong><span class="badge badge--status">${kind}</span></div>
      <code class="pipe-value">${value}</code>
      ${note ? `<p class="pipe-note">${note}</p>` : ''}
    </li>`;

  // Shared state: the key pair and the ciphertext of Part 1 are the target of the attack.
  const state = { keys: EC.generateKeyPair(KEY_BITS), message: '', blocks: [] };

  // ---------------------------------------------------------------- charts
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.hidden = true;
  document.body.append(tooltip);
  const showTip = (event, html) => {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8)}px`;
    tooltip.style.top = `${event.clientY - tooltip.offsetHeight - 12}px`;
  };
  const hideTip = () => { tooltip.hidden = true; };

  const el = (name, attributes = {}, parent = null) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (parent) parent.append(element);
    return element;
  };

  // Full-width charts get a wider viewBox, so that text keeps the same size as in half-width charts.
  const frame = (container, { yMax, yFormat, xLabel, yLabel, wide = false, ticks = 4 }) => {
    container.innerHTML = '';
    const roomy = wide && container.clientWidth > 640;
    const width = roomy ? 900 : 560;
    const height = roomy ? 280 : 250;
    const plot = { x: 50, y: 14, w: width - 64, h: height - 56 };
    const sy = (value) => plot.y + plot.h - (value / yMax) * plot.h;
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' }, container);
    const axis = el('g', { class: 'chart-axis' }, svg);
    for (let i = 0; i <= ticks; i += 1) {
      const value = (yMax / ticks) * i;
      el('line', { x1: plot.x, x2: plot.x + plot.w, y1: sy(value), y2: sy(value), class: i === 0 ? 'chart-baseline' : 'chart-gridline' }, axis);
      el('text', { x: plot.x - 8, y: sy(value) + 4, 'text-anchor': 'end' }, axis).textContent = yFormat(value);
    }
    el('text', { x: plot.x + plot.w / 2, y: height - 4, 'text-anchor': 'middle', class: 'chart-label' }, axis).textContent = xLabel;
    el('text', { x: 12, y: plot.y + plot.h / 2, 'text-anchor': 'middle', class: 'chart-label', transform: `rotate(-90 12 ${plot.y + plot.h / 2})` }, axis).textContent = yLabel;
    return { svg, plot, sy, width, height };
  };

  // Column chart with a horizontal reference line. data: [{ label, value, tip }].
  const barChart = (container, { data, yMax, yFormat, xLabel, yLabel, reference, referenceLabel }) => {
    const { svg, plot, sy } = frame(container, { yMax, yFormat, xLabel, yLabel });
    const band = plot.w / data.length;
    const barWidth = Math.max(4, Math.min(24, band - 2));
    const cx = (i) => plot.x + band * i + band / 2;
    data.forEach((d, i) => {
      const top = sy(Math.min(d.value, yMax));
      if (d.value > 0) el('rect', { x: cx(i) - barWidth / 2, y: top, width: barWidth, height: plot.y + plot.h - top, rx: 3, class: 'chart-bar' }, svg);
      el('text', { x: cx(i), y: plot.y + plot.h + 16, 'text-anchor': 'middle', class: 'chart-tick' }, svg).textContent = d.label;
      const hit = el('rect', { x: plot.x + band * i, y: plot.y, width: band, height: plot.h, class: 'chart-hit' }, svg);
      hit.addEventListener('pointermove', (event) => showTip(event, d.tip));
      hit.addEventListener('pointerleave', hideTip);
    });
    el('line', { x1: plot.x, x2: plot.x + plot.w, y1: sy(reference), y2: sy(reference), class: 'chart-reference' }, svg);
    el('text', { x: plot.x + plot.w, y: sy(reference) - 6, 'text-anchor': 'end', class: 'chart-reference-label' }, svg).textContent = referenceLabel;
  };

  // Line chart with one line per series, a crosshair tooltip and labels at the line ends.
  // series: [{ key, name, color, values }], x: category labels.
  const lineChart = (container, { x, series, yMax, yFormat, xLabel, yLabel, tip }) => {
    const { svg, plot, sy, width } = frame(container, { yMax, yFormat, xLabel, yLabel, wide: true });
    plot.w -= 130; // room for the end labels
    const step = plot.w / (x.length - 1);
    const sx = (i) => plot.x + step * i;
    x.forEach((label, i) => { el('text', { x: sx(i), y: plot.y + plot.h + 16, 'text-anchor': 'middle', class: 'chart-tick' }, svg).textContent = label; });
    const cross = el('line', { y1: plot.y, y2: plot.y + plot.h, class: 'chart-crosshair', visibility: 'hidden' }, svg);
    const ends = [];
    series.forEach((s) => {
      el('path', { d: s.values.map((v, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(v)}`).join(''), class: 'chart-line', stroke: s.color }, svg);
      s.values.forEach((v, i) => el('circle', { cx: sx(i), cy: sy(v), r: 4, class: 'chart-dot', fill: s.color }, svg));
      ends.push({ s, y: sy(s.values[s.values.length - 1]) });
    });
    // End labels, pushed apart so that they never overlap.
    ends.sort((p, q) => p.y - q.y);
    ends.forEach((e, i) => { if (i && e.y - ends[i - 1].y < 13) e.y = ends[i - 1].y + 13; });
    ends.forEach((e) => { el('text', { x: sx(x.length - 1) + 10, y: e.y + 4, class: 'chart-end-label' }, svg).textContent = e.s.name; });
    const hit = el('rect', { x: plot.x - step / 2, y: plot.y, width: plot.w + step, height: plot.h, class: 'chart-hit' }, svg);
    hit.addEventListener('pointermove', (event) => {
      const box = svg.getBoundingClientRect();
      const px = ((event.clientX - box.left) / box.width) * width;
      const i = Math.max(0, Math.min(x.length - 1, Math.round((px - plot.x) / step)));
      cross.setAttribute('x1', sx(i));
      cross.setAttribute('x2', sx(i));
      cross.setAttribute('visibility', 'visible');
      showTip(event, tip(i));
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
  };

  const legend = (container, series) => {
    container.innerHTML = series.map((s) => `<span class="chart-legend-item"><span class="chart-swatch" style="background:${s.color}"></span>${s.name}</span>`).join('');
  };

  // ======================================================== Part 1: EC-ElGamal
  const ecForm = $('[data-ec-form]');
  const ecOutput = $('[data-ec-output]');
  const encryptMessage = () => {
    state.message = $('[name="message"]', ecForm).value || ' ';
    state.blocks = EC.encrypt(state.message, state.keys.Q);
    const { k, Q } = state.keys;
    const decrypted = EC.decrypt(state.blocks, k).text;
    const ciphertext = state.blocks.map((b, i) => `block ${i + 1}: C1 = ${EC.compressed(b.C1)}<br>${'&nbsp;'.repeat(9 + String(i + 1).length)}C2 = ${EC.compressed(b.C2)}`).join('<br>');
    ecOutput.innerHTML = `<ol class="pipe-steps">
        ${step('Private key k', 'secret · receiver', `k = ${fmtInt(k)}`, `Drawn from 1 ≤ k ≤ 2<sup>${KEY_BITS}</sup>: the toy restriction.`)}
        ${step('Public key Q = kG', 'public', `Q = ${EC.compressed(Q)}`)}
        ${step('Ciphertext (C1, C2)', 'encryption · sender', ciphertext, 'C1 = rG, C2 = M + rQ, with a fresh random r for every block. Points are shown compressed.')}
        ${step('Decrypted message', 'M = C2 − kC1', escapeHtml(decrypted), decrypted === state.message ? '✓ identical to the original message.' : '✗ differs from the original message.')}
      </ol>`;
    document.dispatchEvent(new CustomEvent('ec-encrypted'));
  };
  if (ecForm) {
    ecForm.addEventListener('submit', (event) => { event.preventDefault(); encryptMessage(); });
    encryptMessage();
  }

  // ===================================================== Part 2: Caesar cipher
  const caesarForm = $('[data-caesar-form]');
  if (caesarForm) {
    const messageInput = $('[name="message"]', caesarForm);
    const keyInput = $('[name="key"]', caesarForm);
    const output = $('[data-caesar-output]');
    const run = () => {
      const key = ((Math.round(Number(keyInput.value) || 0) % 26) + 26) % 26;
      const message = messageInput.value;
      const ciphertext = C.encrypt(message, key);
      const decrypted = C.decrypt(ciphertext, key);
      output.innerHTML = `<ol class="pipe-steps">
          ${step(`Ciphertext, c = (p + ${key}) mod 26`, 'encryption', escapeHtml(ciphertext))}
          ${step(`Decrypted, p = (c − ${key}) mod 26`, 'decryption', escapeHtml(decrypted), decrypted === message ? '✓ identical to the original message.' : '')}
        </ol>`;
    };
    caesarForm.addEventListener('submit', (event) => { event.preventDefault(); run(); });
    keyInput.addEventListener('input', run);
    // The same message as Part 1.
    $('[data-ec-form] [name="message"]')?.addEventListener('input', (event) => { messageInput.value = event.target.value; run(); });
    run();
  }

  // ================================================ comparison: ciphertext statistics
  const compare = $('[data-compare]');
  if (compare) {
    const plain = C.snippet(CORPUS.test.text, 600);
    const key = 1 + Math.floor(Math.random() * 25);
    const counts = C.letterCounts(C.encrypt(plain, key));
    const letters = counts.reduce((s, c) => s + c, 0);
    const percent = (v) => `${Math.round(v * 100)}%`;
    barChart($('[data-chart="caesar-letters"]', compare), {
      data: counts.map((c, i) => ({ label: C.ALPHABET[i], value: c / letters, tip: `<strong>${C.ALPHABET[i].toUpperCase()}</strong>${c} of ${letters} letters (${((c / letters) * 100).toFixed(1)}%)` })),
      yMax: 0.16,
      yFormat: percent,
      xLabel: `ciphertext letter (key ${key})`,
      yLabel: 'share',
      reference: 1 / 26,
      referenceLabel: 'uniform 1/26'
    });

    const digits = new Array(16).fill(0);
    EC.encrypt(plain, state.keys.Q).forEach((b) => [b.C1, b.C2].forEach((A) => { for (const d of EC.hex(A.x)) digits[parseInt(d, 16)] += 1; }));
    const total = digits.reduce((s, c) => s + c, 0);
    barChart($('[data-chart="ec-digits"]', compare), {
      data: digits.map((c, i) => ({ label: i.toString(16), value: c / total, tip: `<strong>hex digit ${i.toString(16)}</strong>${c} of ${total} digits (${((c / total) * 100).toFixed(1)}%)` })),
      yMax: 0.16,
      yFormat: percent,
      xLabel: 'hex digit of the x coordinates of C1 and C2',
      yLabel: 'share',
      reference: 1 / 16,
      referenceLabel: 'uniform 1/16'
    });
  }

  // ====================================== cryptanalysis of Caesar: success by length
  const METHOD_INFO = [
    { key: 'exhaustive', name: 'Exhaustive + words', color: '#eb6834' },
    { key: 'chiSquared', name: 'Chi-squared', color: '#1baf7a' },
    { key: 'bigram', name: 'Bigrams', color: '#2a78d6' }
  ];

  const experimentSection = $('[data-experiment]');
  if (experimentSection) {
    const model = C.buildModel(CORPUS.reference.text);
    const lengths = [3, 5, 8, 10, 15, 20, 30, 50, 100, 200];
    legend($('[data-legend]', experimentSection), METHOD_INFO);
    setTimeout(() => {
      const rows = C.experiment(CORPUS.test.text, model, { lengths, trials: 500, methods: METHOD_INFO.map((m) => m.key) });
      lineChart($('[data-chart="success"]', experimentSection), {
        x: lengths,
        series: METHOD_INFO.map((m) => ({ ...m, values: rows.map((r) => r.rates[m.key]) })),
        yMax: 1,
        yFormat: (v) => `${Math.round(v * 100)}%`,
        xLabel: 'ciphertext length (letters)',
        yLabel: 'key recovered',
        tip: (i) => `<strong>${lengths[i]} letters</strong>${METHOD_INFO.map((m) => `${m.name}: ${(rows[i].rates[m.key] * 100).toFixed(0)}%`).join('<br>')}`
      });
    }, 20);
  }

  // ====================================================== attack on the toy key
  const attack = $('[data-attack]');
  if (attack) {
    const output = $('[data-attack-output]', attack);
    const buttons = [...attack.querySelectorAll('[data-method]')];

    const renderTarget = () => {
      $('[data-attack-target]', attack).innerHTML = `<ol class="pipe-steps">
          ${step('What the attacker knows', 'public', `Q = ${EC.compressed(state.keys.Q)}<br>${state.blocks.map((b, i) => `C${i + 1} = (${EC.compressed(b.C1).slice(0, 18)}…, ${EC.compressed(b.C2).slice(0, 18)}…)`).join('<br>')}`, `The public key and the ciphertext from Part 1, plus the design of the scheme: k ≤ 2<sup>${KEY_BITS}</sup>.`)}
        </ol>`;
      $('[data-tiles="attack"]', attack).innerHTML = '';
      output.innerHTML = '';
    };

    const runAttack = async (method) => {
      buttons.forEach((b) => { b.disabled = true; });
      output.innerHTML = '<p class="keygen-note">Searching…</p>';
      const { Q, k: secret } = state.keys;
      const { blocks, message } = state;
      const fn = method === 'bsgs' ? EC.babyStepGiantStep : EC.bruteForce;
      const result = await fn(Q, KEY_BITS);
      buttons.forEach((b) => { b.disabled = false; });
      if (result.k === null) {
        output.innerHTML = '<p class="pipe-error">Key not found in the range.</p>';
        return;
      }
      const { text } = EC.decrypt(blocks, result.k);
      tiles($('[data-tiles="attack"]', attack), [
        ['Recovered private key', fmtInt(result.k), result.k === secret ? '✓ the real k' : '✗ wrong'],
        ['Point additions', fmtInt(result.operations), method === 'bsgs' ? `table of ${fmtInt(result.tableSize)} points` : `of ${fmtInt(2 ** KEY_BITS)} possible keys`],
        ['Time', `${(result.ms / 1000).toFixed(2)} s`]
      ]);
      output.innerHTML = `<ol class="pipe-steps">${step('Message decrypted with the recovered key', 'M = C2 − kC1', escapeHtml(text), text === message ? '✓ identical to the original message.' : '')}</ol>`;
    };

    buttons.forEach((b) => b.addEventListener('click', () => runAttack(b.dataset.method)));
    document.addEventListener('ec-encrypted', renderTarget);
    renderTarget();
  }
})();
