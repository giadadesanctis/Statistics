/*
 * Homework 2 page: the wallet pipeline step by step and the statistical
 * experiments. Needs wordlist.js and wallet.js.
 */
(() => {
  const { Wallet: W } = window;
  if (!W) return;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const encoder = new TextEncoder();
  const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
  const popcount = (bytes) => bytes.reduce((n, b) => n + b.toString(2).split('1').length - 1, 0);

  // ------------------------------------------------------------- pipeline
  const form = $('[data-pipeline-form]');
  if (form) {
    const mnemonicInput = $('[name="mnemonic"]', form);
    const passInput = $('[name="passphrase"]', form);
    const accountInput = $('[name="account"]', form);
    const output = $('[data-pipeline-output]');

    const step = (title, standard, kind, value, note = '') => `<li class="pipe-step">
        <div class="pipe-head"><strong>${title}</strong><span class="badge">${standard}</span><span class="badge badge--status">${kind}</span></div>
        <code class="pipe-value">${value}</code>
        ${note ? `<p class="pipe-note">${note}</p>` : ''}
      </li>`;

    const run = async () => {
      try {
        const r = await W.pipeline(mnemonicInput.value, { passphrase: passInput.value, account: Math.max(0, Number(accountInput.value) || 0) });
        const hex = W.toHex;
        output.innerHTML = `<ol class="pipe-steps">
          ${step('Entropy', 'random', 'key generation', hex(r.entropy), `${r.entropy.length * 8} random bits: the only real secret of the wallet.`)}
          ${step('Mnemonic', 'BIP-39', 'encoding + checksum', mnemonicInput.value.trim().toLowerCase().split(/\s+/).join(' '), 'The bits split into groups of 11, one word each; the last word also carries 4 checksum bits (first bits of SHA-256).')}
          ${step('Seed', 'BIP-39', 'key derivation', hex(r.seed), 'PBKDF2-HMAC-SHA512 with 2048 iterations and salt "mnemonic" + passphrase: slow on purpose.')}
          ${step('Master key', 'BIP-32', 'key derivation', `key ${hex(r.master.key)}<br>chain code ${hex(r.master.chainCode)}`, 'HMAC-SHA512 with key "Bitcoin seed": 32 bytes of private key and 32 bytes of chain code.')}
          ${step('Private key', 'BIP-44 path', 'key derivation', hex(r.privateKey), `Path ${r.path}: purpose 44', coin 60' (Ether), account 0', external chain 0, address ${accountInput.value || 0}.`)}
          ${step('Public key', 'secp256k1', 'public-key cryptography', hex(r.publicKey), 'Q = kG on secp256k1: the 32-byte x and 32-byte y of the point.')}
          ${step('Hash of the public key', 'Keccak-256', 'hashing', hex(r.hash), 'The address is the last 20 bytes (40 hex digits).')}
          ${step('Address', 'hex', 'encoding', r.address)}
          ${step('Checksummed address', 'EIP-55', 'checksum + encoding', r.checksummed, 'A letter is uppercase when the matching hex digit of Keccak-256(lowercase address) is 8 or more.')}
        </ol>`;
      } catch (error) {
        output.innerHTML = '<p class="pipe-error"></p>';
        output.firstChild.textContent = error.message;
      }
    };

    $('[data-random-mnemonic]', form).addEventListener('click', async () => {
      mnemonicInput.value = await W.entropyToMnemonic(randomBytes(16));
      run();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      run();
    });
    run();
  }

  // Keccak-256 vs SHA3-256 on the empty string.
  const hashDemo = $('[data-hash-demo]');
  if (hashDemo) {
    hashDemo.innerHTML = `<div class="pipe-compare"><span>Keccak-256("")</span><code>${W.toHex(W.keccak256(new Uint8Array()))}</code></div>
      <div class="pipe-compare"><span>SHA3-256("")</span><code>${W.toHex(W.sha3_256(new Uint8Array()))}</code></div>`;
  }

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

  // Column chart with an expected curve drawn as a polyline. data: [{ label, value, expected, tip }].
  const barChart = (container, { data, xLabel, yLabel }) => {
    container.innerHTML = '';
    const width = 560;
    const height = 250;
    const plot = { x: 46, y: 14, w: width - 60, h: height - 56 };
    const top = Math.max(...data.map((d) => Math.max(d.value, d.expected)));
    const yMax = Math.ceil(top / 50) * 50 || 1;
    const sy = (value) => plot.y + plot.h - (value / yMax) * plot.h;
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' }, container);
    const axis = el('g', { class: 'chart-axis' }, svg);
    for (let i = 0; i <= 4; i += 1) {
      const value = (yMax / 4) * i;
      el('line', { x1: plot.x, x2: plot.x + plot.w, y1: sy(value), y2: sy(value), class: i === 0 ? 'chart-baseline' : 'chart-gridline' }, axis);
      el('text', { x: plot.x - 8, y: sy(value) + 4, 'text-anchor': 'end' }, axis).textContent = Math.round(value);
    }
    el('text', { x: plot.x + plot.w / 2, y: height - 4, 'text-anchor': 'middle', class: 'chart-label' }, axis).textContent = xLabel;
    el('text', { x: 12, y: plot.y + plot.h / 2, 'text-anchor': 'middle', class: 'chart-label', transform: `rotate(-90 12 ${plot.y + plot.h / 2})` }, axis).textContent = yLabel;

    const band = plot.w / data.length;
    const barWidth = Math.min(24, band - 4);
    const cx = (i) => plot.x + band * i + band / 2;
    data.forEach((d, i) => {
      if (d.value > 0) el('rect', { x: cx(i) - barWidth / 2, y: sy(d.value), width: barWidth, height: plot.y + plot.h - sy(d.value), rx: 3, class: 'chart-bar' }, svg);
      if (i % 2 === 0) el('text', { x: cx(i), y: plot.y + plot.h + 16, 'text-anchor': 'middle', class: 'chart-tick' }, svg).textContent = d.label;
      const hit = el('rect', { x: plot.x + band * i, y: plot.y, width: band, height: plot.h, class: 'chart-hit' }, svg);
      hit.addEventListener('pointermove', (event) => {
        tooltip.innerHTML = d.tip;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8)}px`;
        tooltip.style.top = `${event.clientY - tooltip.offsetHeight - 12}px`;
      });
      hit.addEventListener('pointerleave', () => { tooltip.hidden = true; });
    });
    el('path', { d: data.map((d, i) => `${i ? 'L' : 'M'}${cx(i)},${sy(d.expected)}`).join(''), class: 'chart-reference' }, svg);
  };

  // log of n choose k, for binomial probabilities.
  const logChoose = (n, k) => {
    let sum = 0;
    for (let i = 1; i <= k; i += 1) sum += Math.log((n - k + i) / i);
    return sum;
  };
  const binomial = (n, k, q) => Math.exp(logChoose(n, k) + k * Math.log(q) + (n - k) * Math.log(1 - q));

  const tiles = (container, items) => {
    container.innerHTML = items.map(([label, value, note]) => `<div class="stat-tile"><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${note ? `<span class="stat-note">${note}</span>` : ''}</div>`).join('');
  };

  // ------------------------------------------------------------ statistics
  const stats = $('[data-stats]');
  if (stats) {
    const runButton = $('[data-run]', stats);

    const run = async () => {
      runButton.disabled = true;
      const samples = 1000;

      // 1. Keccak-256: avalanche and bit balance on random 64-byte public-key-sized inputs.
      const distances = [];
      let ones = 0;
      for (let i = 0; i < samples; i += 1) {
        const input = randomBytes(64);
        const hash = W.keccak256(input);
        ones += popcount(hash);
        const bit = Math.floor(Math.random() * 512);
        input[bit >> 3] ^= 1 << (bit & 7);
        const flipped = W.keccak256(input);
        distances.push(popcount(hash.map((b, j) => b ^ flipped[j])));
      }
      const from = 96;
      const binWidth = 4;
      const bins = 16;
      const counts = new Array(bins).fill(0);
      distances.forEach((d) => { counts[Math.max(0, Math.min(bins - 1, Math.floor((d - from) / binWidth)))] += 1; });
      barChart($('[data-chart="avalanche"]', stats), {
        data: counts.map((value, i) => {
          let p = 0;
          for (let d = from + i * binWidth; d < from + (i + 1) * binWidth; d += 1) p += binomial(256, d, 0.5);
          const expected = p * samples;
          return { label: from + i * binWidth, value, expected, tip: `<strong>${from + i * binWidth}–${from + (i + 1) * binWidth - 1} bits changed</strong>${value} samples · Binomial(256, ½): ${expected.toFixed(1)}` };
        }),
        xLabel: 'output bits changed by one flipped input bit',
        yLabel: 'samples'
      });
      const meanDistance = distances.reduce((a, b) => a + b, 0) / samples;
      tiles($('[data-tiles="keccak"]', stats), [
        ['Bits changed, average', meanDistance.toFixed(1), 'of 256 (expected 128)'],
        ['Ones in the output', `${((ones / (samples * 256)) * 100).toFixed(2)}%`, 'expected 50%']
      ]);

      // 2. EIP-55: number of letters a-f in random addresses, share of uppercase letters.
      const letterCounts = new Array(41).fill(0);
      let letters = 0;
      let upper = 0;
      for (let i = 0; i < samples; i += 1) {
        const checksummed = W.toChecksumAddress(W.toHex(randomBytes(20))).slice(2);
        const found = checksummed.replace(/[0-9]/g, '');
        letterCounts[found.length] += 1;
        letters += found.length;
        upper += found.replace(/[a-f]/g, '').length;
      }
      const shown = letterCounts.slice(5, 27);
      barChart($('[data-chart="letters"]', stats), {
        data: shown.map((value, i) => {
          const L = i + 5;
          const expected = binomial(40, L, 6 / 16) * samples;
          return { label: L, value, expected, tip: `<strong>${L} letters</strong>${value} addresses · Binomial(40, 6/16): ${expected.toFixed(1)}` };
        }),
        xLabel: 'letters a–f in a 40-digit address',
        yLabel: 'addresses'
      });
      tiles($('[data-tiles="eip55"]', stats), [
        ['Letters per address', (letters / samples).toFixed(1), 'expected 40 · 6/16 = 15'],
        ['Uppercase letters', `${((upper / letters) * 100).toFixed(1)}%`, 'expected 50%'],
        ['Typo not detected', '≈ 1 in 4000', '(13/16)^40 = 0.00025']
      ]);

      // 3. BIP-39: share of random 12-word sequences with a valid checksum.
      const trials = 2000;
      let valid = 0;
      for (let i = 0; i < trials; i += 1) {
        const phrase = Array.from({ length: 12 }, () => window.BIP39_WORDLIST[crypto.getRandomValues(new Uint16Array(1))[0] % 2048]).join(' ');
        try {
          await W.mnemonicToEntropy(phrase);
          valid += 1;
        } catch {
          // invalid checksum: expected in 15 cases out of 16
        }
      }
      tiles($('[data-tiles="bip39"]', stats), [
        ['Random 12-word phrases', trials],
        ['Valid checksum', `${((valid / trials) * 100).toFixed(1)}%`, 'expected 1/16 = 6.25%']
      ]);
      runButton.disabled = false;
    };

    runButton.addEventListener('click', run);
    run();
  }
})();
