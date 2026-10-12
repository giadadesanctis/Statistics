/*
 * Slowed-down visualisation of scalar multiplication on the toy curve
 * y^2 = x^3 + 7 (mod 17).
 *
 * Every group operation is played in phases:
 *   1. the two operands are highlighted;
 *   2. the "line" through them is drawn: over F_p a line is the set of p grid
 *      points (t, lambda*t + c mod p);
 *   3. the third point where the line meets the curve, -R, is marked;
 *   4. -R is reflected over the x axis (y -> p - y) to obtain R.
 *
 * Usage: ToyVisualizer.create(element, { curve, k, base }) - needs ecc.js.
 * Styles live in visualizer.css; colors can be overridden with --viz-* variables.
 */
(function (root) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PHASE_MS = [1600, 1000, 650, 380, 180];

  const svgElement = (name, attributes = {}, parent = null) => {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (parent) parent.append(element);
    return element;
  };

  const create = (container, options = {}) => {
    const ECC = options.ECC || root.ECC;
    const curve = options.curve || ECC.TOY_CURVE;
    const p = Number(curve.p);
    const basePoints = ECC.enumeratePoints(curve)
      .map((point) => ({ point, order: Number(ECC.pointOrder(curve, point)) }))
      .sort((a, b) => b.order - a.order || Number(a.point.x - b.point.x));

    const cell = 26;
    const margin = 34;
    const plot = cell * (p - 1);
    const size = plot + margin * 2;
    const sx = (x) => margin + Number(x) * cell;
    const sy = (y) => margin + plot - Number(y) * cell;
    const mod = (value) => ((value % p) + p) % p;
    const fmt = ECC.formatPoint;

    container.classList.add('ecc-viz');
    container.innerHTML = `
      <div class="ecc-viz-controls">
        <label><span>Private key <em>k</em></span>
          <input type="number" min="1" max="60" value="${options.k || 6}" data-k>
        </label>
        <label><span>Base point <em>G</em></span>
          <select data-base>${basePoints.map(({ point, order }, index) => `<option value="${index}"${ECC.equals(point, options.base || curve.G) ? ' selected' : ''}>${fmt(point)} · order ${order}</option>`).join('')}</select>
        </label>
        <label><span>Method</span>
          <select data-method>
            <option value="double-and-add">Double-and-add</option>
            <option value="naive">Repeated addition</option>
          </select>
        </label>
        <label><span>Speed</span>
          <input type="range" min="0" max="4" value="1" data-speed>
        </label>
        <div class="ecc-viz-buttons">
          <button type="button" data-play><i class="fa-solid fa-play" aria-hidden="true"></i><span>Play</span></button>
          <button type="button" data-step><i class="fa-solid fa-forward-step" aria-hidden="true"></i><span>Step</span></button>
          <button type="button" data-reset><i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>Reset</span></button>
        </div>
      </div>
      <div class="ecc-viz-body">
        <div class="ecc-viz-canvas"></div>
        <div class="ecc-viz-side">
          <p class="ecc-viz-status" aria-live="polite"></p>
          <ol class="ecc-viz-log"></ol>
        </div>
      </div>`;

    const $ = (selector) => container.querySelector(selector);
    const inputs = { k: $('[data-k]'), base: $('[data-base]'), method: $('[data-method]'), speed: $('[data-speed]') };
    const buttons = { play: $('[data-play]'), step: $('[data-step]'), reset: $('[data-reset]') };
    const status = $('.ecc-viz-status');
    const log = $('.ecc-viz-log');

    // ------------------------------------------------------------ static layer
    const svg = svgElement('svg', {
      viewBox: `0 0 ${size + 70} ${size}`,
      role: 'img',
      'aria-label': `The ${p * p} points of the grid F_${p} x F_${p}; the points of the curve are highlighted`
    }, $('.ecc-viz-canvas'));

    const grid = svgElement('g', { class: 'ecc-viz-grid' }, svg);
    for (let t = 0; t < p; t += 1) {
      svgElement('line', { x1: sx(t), y1: sy(0), x2: sx(t), y2: sy(p - 1) }, grid);
      svgElement('line', { x1: sx(0), y1: sy(t), x2: sx(p - 1), y2: sy(t) }, grid);
      if (t % 2 === 0 || t === p - 1) {
        svgElement('text', { x: sx(t), y: sy(0) + 20, class: 'ecc-viz-tick', 'text-anchor': 'middle' }, grid).textContent = t;
        svgElement('text', { x: sx(0) - 12, y: sy(t) + 4, class: 'ecc-viz-tick', 'text-anchor': 'end' }, grid).textContent = t;
      }
    }
    svgElement('text', { x: sx(p - 1) + 14, y: sy(0) + 4, class: 'ecc-viz-axis' }, grid).textContent = 'x';
    svgElement('text', { x: sx(0), y: margin - 16, class: 'ecc-viz-axis', 'text-anchor': 'middle' }, grid).textContent = 'y';

    const curveLayer = svgElement('g', {}, svg);
    for (const { point } of basePoints) {
      svgElement('circle', { cx: sx(point.x), cy: sy(point.y), r: 4.5, class: 'ecc-viz-curve-point' }, curveLayer);
    }

    // The point at infinity lives outside the grid.
    const infinity = svgElement('g', { class: 'ecc-viz-infinity' }, svg);
    svgElement('circle', { cx: size + 30, cy: margin + 10, r: 15 }, infinity);
    svgElement('text', { x: size + 30, y: margin + 15, 'text-anchor': 'middle' }, infinity).textContent = 'O';
    svgElement('text', { x: size + 30, y: margin + 44, 'text-anchor': 'middle', class: 'ecc-viz-tick' }, infinity).textContent = 'infinity';

    const lineLayer = svgElement('g', {}, svg);
    const visitedLayer = svgElement('g', {}, svg);
    const activeLayer = svgElement('g', {}, svg);

    // --------------------------------------------------------------- the plan
    let operations = [];
    let opIndex = 0;
    let phase = 0;
    let timer = null;

    const describe = (operation) => {
      const { left, right, rule, result, multiple } = operation;
      if (operation.kind === 'start') return `Start: R = G = ${fmt(result)}`;
      const name = operation.kind === 'double' ? `Double: 2 · ${fmt(left)}` : `Add: ${fmt(left)} + ${fmt(right)}`;
      if (rule === 'identity') return `${name} → O is the neutral element, so ${multiple}G = ${fmt(result)}`;
      if (rule === 'inverse') return `${name} → same x, opposite y: vertical line, ${multiple}G = O`;
      const numerator = rule === 'double' ? mod(3 * Number(left.x) ** 2 + Number(curve.a)) : mod(Number(right.y) - Number(left.y));
      const denominator = rule === 'double' ? mod(2 * Number(left.y)) : mod(Number(right.x) - Number(left.x));
      const inverse = Number(ECC.modInverse(BigInt(denominator), curve.p));
      return `${name}: λ = ${numerator} · ${denominator}⁻¹ = ${numerator} · ${inverse} ≡ ${operation.lambda} (mod ${p}) → ${multiple}G = ${fmt(result)}`;
    };

    const buildPlan = () => {
      const k = Math.min(60, Math.max(1, Math.round(Number(inputs.k.value) || 1)));
      inputs.k.value = k;
      const base = basePoints[Number(inputs.base.value)].point;
      const plan = [];
      if (inputs.method.value === 'naive') {
        let R = ECC.INFINITY;
        for (let m = 1; m <= k; m += 1) {
          const detail = ECC.addDetailed(curve, R, base);
          plan.push({ kind: m === 1 ? 'start' : 'add', left: R, right: base, ...detail, multiple: m });
          R = detail.result;
        }
      } else {
        for (const step of ECC.scalarMultiply(curve, BigInt(k), base, { trace: true }).steps) {
          const kind = step.op === 'double' ? 'double' : step.op;
          const right = step.op === 'double' ? step.from : base;
          const detail = ECC.addDetailed(curve, step.from, right);
          plan.push({ kind, left: step.from, right, ...detail, multiple: Number(step.multiple), bit: step.bit });
        }
      }
      return { k, base, plan };
    };

    // ------------------------------------------------------------- rendering
    const clear = (layer) => {
      while (layer.firstChild) layer.firstChild.remove();
    };

    // One label per point: an active label (R, G, -R, result) replaces the
    // "visited" label on the same point, and active labels on one point are merged.
    const visitedLabels = new Map();
    const activeLabels = new Map();

    const marker = (layer, P, className, label) => {
      if (ECC.isInfinity(P)) {
        infinity.classList.add('is-active');
        return;
      }
      svgElement('circle', { cx: sx(P.x), cy: sy(P.y), r: 8, class: className }, layer);
      if (!label) return;
      const key = fmt(P);
      if (layer === visitedLayer) {
        visitedLabels.set(key, svgElement('text', { x: sx(P.x) + 11, y: sy(P.y) - 9, class: 'ecc-viz-label' }, layer));
        visitedLabels.get(key).textContent = label;
        return;
      }
      visitedLabels.get(key)?.remove();
      if (activeLabels.has(key)) {
        activeLabels.get(key).textContent += ` = ${label}`;
      } else {
        activeLabels.set(key, svgElement('text', { x: sx(P.x) + 11, y: sy(P.y) - 9, class: 'ecc-viz-label' }, layer));
        activeLabels.get(key).textContent = label;
      }
    };

    const linePoints = (operation) => {
      const { left, rule, lambda } = operation;
      if (rule === 'inverse') return Array.from({ length: p }, (_, t) => [Number(left.x), t]);
      const slope = Number(lambda);
      const intercept = mod(Number(left.y) - slope * Number(left.x));
      return Array.from({ length: p }, (_, t) => [t, mod(slope * t + intercept)]);
    };

    const phasesOf = (operation) => (operation.kind === 'start' || operation.rule === 'identity' ? 1 : operation.rule === 'inverse' ? 3 : 5);

    const renderVisited = () => {
      clear(visitedLayer);
      visitedLabels.clear();
      const labels = new Map();
      for (let i = 0; i < opIndex; i += 1) {
        const { result, multiple } = operations[i];
        const key = fmt(result);
        labels.set(key, [...(labels.get(key) || []), `${multiple}G`]);
      }
      for (const [key, names] of labels) {
        if (key === 'O') continue;
        const [x, y] = key.slice(1, -1).split(', ').map(Number);
        marker(visitedLayer, { x, y }, 'ecc-viz-visited', names.slice(-2).join(', '));
      }
    };

    const render = () => {
      clear(lineLayer);
      clear(activeLayer);
      activeLabels.clear();
      infinity.classList.remove('is-active');
      renderVisited();

      const finished = opIndex >= operations.length;
      buttons.step.disabled = finished;
      buttons.play.disabled = finished;
      if (finished) {
        const last = operations[operations.length - 1];
        marker(activeLayer, last.result, 'ecc-viz-result', `Q = ${last.multiple}G`);
        status.innerHTML = `<strong>Public key</strong> Q = ${last.multiple}G = ${fmt(last.result)}`;
        return;
      }

      const operation = operations[opIndex];
      const hasLine = phase >= 1 && phasesOf(operation) > 1;
      if (hasLine) {
        for (const [x, y] of linePoints(operation)) {
          svgElement('circle', { cx: sx(x), cy: sy(y), r: 3, class: 'ecc-viz-line-point' }, lineLayer);
        }
      }

      if (operation.kind === 'start' || operation.rule === 'identity') {
        marker(activeLayer, operation.result, 'ecc-viz-result', `${operation.multiple}G`);
        status.textContent = describe(operation);
        return;
      }

      marker(activeLayer, operation.left, 'ecc-viz-operand', operation.kind === 'double' ? 'R' : 'R');
      if (operation.kind === 'add') marker(activeLayer, operation.right, 'ecc-viz-operand', 'G');

      const texts = [
        operation.kind === 'double' ? 'Doubling R: we need the tangent at R.' : 'Adding G to R: we need the line through both points.',
        operation.rule === 'inverse'
          ? 'The two points share the same x: the line is vertical.'
          : `The line has slope λ = ${operation.lambda}: over F_${p} it is a set of ${p} grid points.`,
        operation.rule === 'inverse' ? 'A vertical line never meets the curve again: the result is O.' : 'The line meets the curve in a third point, −R.',
        'Reflect −R over the x axis: y → p − y.',
        `Result: ${operation.multiple}G = ${fmt(operation.result)}`
      ];
      status.textContent = texts[Math.min(phase, texts.length - 1)];

      if (operation.rule === 'inverse') {
        if (phase >= 2) marker(activeLayer, ECC.INFINITY);
        return;
      }
      if (phase >= 2) {
        const third = ECC.negate(curve, operation.result);
        marker(activeLayer, third, 'ecc-viz-third', '−R');
        if (phase >= 3) {
          svgElement('line', {
            x1: sx(third.x), y1: sy(third.y), x2: sx(operation.result.x), y2: sy(operation.result.y), class: 'ecc-viz-reflection'
          }, activeLayer);
        }
        if (phase >= 4) marker(activeLayer, operation.result, 'ecc-viz-result', `${operation.multiple}G`);
      }
    };

    const appendLog = (operation) => {
      const item = document.createElement('li');
      if (operation.bit !== undefined) {
        const badge = document.createElement('span');
        badge.className = 'ecc-viz-bit';
        badge.textContent = `bit ${operation.bit}`;
        item.append(badge);
      }
      item.append(document.createTextNode(describe(operation)));
      log.append(item);
      log.scrollTop = log.scrollHeight;
    };

    const advance = () => {
      if (opIndex >= operations.length) return false;
      phase += 1;
      if (phase >= phasesOf(operations[opIndex])) {
        appendLog(operations[opIndex]);
        opIndex += 1;
        phase = 0;
      }
      render();
      return opIndex < operations.length;
    };

    const pause = () => {
      window.clearTimeout(timer);
      timer = null;
      buttons.play.querySelector('span').textContent = 'Play';
      buttons.play.querySelector('i').className = 'fa-solid fa-play';
    };

    const loop = () => {
      if (advance()) {
        timer = window.setTimeout(loop, PHASE_MS[Number(inputs.speed.value)]);
      } else {
        pause();
      }
    };

    const reset = () => {
      pause();
      const { k, plan } = buildPlan();
      operations = plan;
      opIndex = 0;
      phase = 0;
      log.innerHTML = '';
      const method = inputs.method.value === 'naive' ? 'repeated addition' : `double-and-add (k = ${k} = ${k.toString(2)} in binary)`;
      const header = document.createElement('li');
      header.className = 'ecc-viz-log-header';
      header.textContent = `${plan.length} group operations with ${method}`;
      log.append(header);
      render();
    };

    buttons.play.addEventListener('click', () => {
      if (timer) {
        pause();
        return;
      }
      buttons.play.querySelector('span').textContent = 'Pause';
      buttons.play.querySelector('i').className = 'fa-solid fa-pause';
      loop();
    });
    buttons.step.addEventListener('click', () => {
      pause();
      advance();
    });
    buttons.reset.addEventListener('click', reset);
    for (const input of [inputs.k, inputs.base, inputs.method]) input.addEventListener('change', reset);

    reset();
    return { reset, pause };
  };

  root.ToyVisualizer = { create };
})(typeof self !== 'undefined' ? self : this);
