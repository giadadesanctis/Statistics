/*
 * Numerical integration in the style of Riemann (slice the domain) and of Lebesgue (slice the
 * range and measure the preimages), plus the exact computations for the pathological functions.
 */
((root) => {
  // Si(pi), the value of the integral of sin(x)/x on [0, pi].
  const SI_PI = 1.851937051982466;

  // ---------------------------------------------------------------- the collection
  // `exact` is the reference value of the integral on [a, b].
  const FUNCTIONS = [
    { id: 'sin', label: 'sin(x) on [0, π]', f: (x) => Math.sin(x), a: 0, b: Math.PI, exact: 2, kind: 'smooth' },
    { id: 'square', label: 'x² on [0, 1]', f: (x) => x * x, a: 0, b: 1, exact: 1 / 3, kind: 'smooth' },
    { id: 'sinc', label: 'sin(x)/x on [0, π]', f: (x) => (x === 0 ? 1 : Math.sin(x) / x), a: 0, b: Math.PI, exact: SI_PI, kind: 'smooth' },
    { id: 'abs', label: '|x − 0.5| on [0, 1]', f: (x) => Math.abs(x - 0.5), a: 0, b: 1, exact: 0.25, kind: 'kink' },
    { id: 'step13', label: '1 if x < 0.5, 3 otherwise', f: (x) => (x < 0.5 ? 1 : 3), a: 0, b: 1, exact: 2, kind: 'jump' },
    { id: 'step10', label: '1 if x < 0.5, 0 otherwise', f: (x) => (x < 0.5 ? 1 : 0), a: 0, b: 1, exact: 0.5, kind: 'jump' },
    { id: 'stepPi', label: '1 if x < 1/π, 3 otherwise', f: (x) => (x < 1 / Math.PI ? 1 : 3), a: 0, b: 1, exact: 3 - 2 / Math.PI, kind: 'jump' },
    { id: 'invSqrt', label: '1/√x on (0, 1]', f: (x) => 1 / Math.sqrt(x), a: 0, b: 1, exact: 2, kind: 'singular', unbounded: true }
  ];

  // ---------------------------------------------------------------- Riemann: slice the domain
  const riemannMidpoint = (f, a, b, n) => {
    const h = (b - a) / n;
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += f(a + (i + 0.5) * h);
    return { value: sum * h, evals: n };
  };

  // ---------------------------------------------------------------- Lebesgue: slice the range
  // Point where the condition f(x) >= t changes between lo and hi (above = condition at lo).
  // Bisection, down to the relative precision of the doubles, also finds jumps.
  const crossing = (f, lo, hi, t, above, counter) => {
    for (let it = 0; it < 120 && hi - lo > 2.3e-16 * Math.abs(hi); it += 1) {
      const mid = 0.5 * (lo + hi);
      if (mid === lo || mid === hi) break;
      counter.evals += 1;
      if ((f(mid) >= t) === above) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  };

  // Levels y_0 < ... < y_K covering the range. Bounded functions go from the minimum to the
  // maximum. An unbounded function is cut at a height `top` that grows with K: with uniform
  // levels at K^(2/3), which balances the two errors, with geometric levels at K^2.
  const makeLevels = (lo, hi, K, spacing) => {
    if (spacing === 'geometric') {
      const q = (hi / lo) ** (1 / K);
      return Array.from({ length: K + 1 }, (_, j) => (j === K ? hi : lo * q ** j));
    }
    return Array.from({ length: K + 1 }, (_, j) => (j === K ? hi : lo + ((hi - lo) * j) / K));
  };

  // Exact preimages. The nodes of a fixed scan grid show where each level is crossed, and every
  // crossing is refined by bisection, so G(y) = measure{f >= y} is known up to rounding. Then
  //   value = sum over j of (y_j + y_{j+1}) / 2 * (G(y_j) - G(y_{j+1})).
  const lebesgueExact = (f, a, b, K, { scan = 2048, spacing = 'uniform', unbounded = false } = {}) => {
    const h = (b - a) / scan;
    const xs = new Float64Array(scan + 1);
    const fs = new Float64Array(scan + 1);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i <= scan; i += 1) {
      xs[i] = i === scan ? b : a + i * h;
      fs[i] = f(xs[i]);
      if (fs[i] < lo) lo = fs[i];
      if (fs[i] > hi && Number.isFinite(fs[i])) hi = fs[i];
    }
    const counter = { evals: scan + 1 };
    const top = unbounded ? (spacing === 'geometric' ? K * K : K ** (2 / 3) + 1) : hi;
    const levels = makeLevels(lo, top, K, spacing);

    // Measure of {f >= t}.
    const measureAbove = (t) => {
      let measure = 0;
      for (let i = 0; i < scan; i += 1) {
        const left = fs[i] >= t;
        const right = fs[i + 1] >= t;
        if (left && right) measure += xs[i + 1] - xs[i];
        else if (left !== right) {
          const r = crossing(f, xs[i], xs[i + 1], t, left, counter);
          measure += left ? r - xs[i] : xs[i + 1] - r;
        }
      }
      return measure;
    };

    // G[0] is the whole domain; for a bounded function the top band is closed, so G[K] = 0.
    const G = new Float64Array(K + 1);
    G[0] = b - a;
    for (let j = 1; j < K; j += 1) G[j] = measureAbove(levels[j]);
    G[K] = unbounded ? measureAbove(levels[K]) : 0;

    let value = 0;
    let lower = 0;
    let upper = 0;
    for (let j = 0; j < K; j += 1) {
      const m = G[j] - G[j + 1]; // measure of E_j = {y_j <= f < y_{j+1}}
      value += 0.5 * (levels[j] + levels[j + 1]) * m;
      lower += levels[j] * m;
      upper += levels[j + 1] * m;
    }
    if (unbounded) { value += top * G[K]; lower += top * G[K]; upper = Infinity; }
    return { value, lower, upper, evals: counter.evals, levels, G };
  };

  // Sampled preimages: the measure of E_j is estimated by counting the points of a grid of N
  // midpoints whose value falls in the band. No root finding, but the grid limits the accuracy.
  const lebesgueSampled = (f, a, b, K, N) => {
    const h = (b - a) / N;
    const fs = new Float64Array(N);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < N; i += 1) {
      fs[i] = f(a + (i + 0.5) * h);
      if (fs[i] < lo) lo = fs[i];
      if (fs[i] > hi) hi = fs[i];
    }
    const dy = (hi - lo) / K || 1;
    const counts = new Float64Array(K);
    for (let i = 0; i < N; i += 1) counts[Math.min(K - 1, Math.floor((fs[i] - lo) / dy))] += 1;
    let value = 0;
    for (let j = 0; j < K; j += 1) value += counts[j] * h * (lo + (j + 0.5) * dy);
    return { value, evals: N };
  };

  // Log-spaced odd sizes. Odd n keeps the breakpoint x = 0.5 away from the cell boundaries, the
  // generic situation: with even n it would be a cell boundary and the error would vanish by luck.
  const oddSizes = (lo, hi, perDecade = 4) => {
    const sizes = new Set();
    for (let t = Math.log10(lo); t <= Math.log10(hi) + 1e-9; t += 1 / perDecade) sizes.add(2 * Math.round(10 ** t / 2) + 1);
    return [...sizes];
  };

  // Least-squares slope of log(y) against log(x), ignoring errors at rounding level.
  const slope = (xs, ys, floor = 1e-13) => {
    const pts = xs.map((x, i) => [Math.log(x), Math.log(ys[i])]).filter((p, i) => ys[i] > floor && Number.isFinite(p[1]));
    if (pts.length < 3) return NaN;
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
    const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    return sxy / sxx;
  };

  // ---------------------------------------------------------------- Thomae's function
  const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

  // Simplest fraction [p, q] in the closed interval [a/b, c/d], from the continued fraction
  // expansion of the two endpoints (Stern-Brocot tree). Its q is the smallest denominator there.
  const simplestFraction = (a, b, c, d) => {
    const whole = Math.floor(a / b);
    if (whole * b === a) return [whole, 1];
    if (whole < Math.floor(c / d)) return [whole + 1, 1];
    const [p, q] = simplestFraction(d, c - whole * d, b, a - whole * b);
    return [whole * p + q, p];
  };

  // Tagged sums of Thomae's function on n equal cells of [0, 1], in exact integer arithmetic.
  const thomaeSums = (n) => {
    let left = 0;
    let mid = 0;
    let upper = 0;
    for (let i = 0; i < n; i += 1) {
      left += i === 0 ? 1 : gcd(i, n) / n; // f(i/n) = 1 / (n / gcd(i, n))
      const p = 2 * i + 1;
      mid += gcd(p, 2 * n) / (2 * n);
      upper += 1 / simplestFraction(i, n, i + 1, n)[1];
    }
    return { left: left / n, mid: mid / n, upper: upper / n };
  };

  // Euler's totient of 1..q, used to count the points where Thomae's function is at least 1/q.
  const pointsAtLeast = (q) => {
    const phi = Array.from({ length: q + 1 }, (_, i) => i);
    let count = 1; // the point 0 = 0/1; the q = 1 term adds the point 1 = 1/1
    for (let d = 1; d <= q; d += 1) {
      if (d > 1 && phi[d] === d) for (let k = d; k <= q; k += d) phi[k] -= phi[k] / d;
      count += phi[d];
    }
    return count;
  };

  // ---------------------------------------------------------------- Smith-Volterra-Cantor set
  // Start from [0, 1]; at step k remove the open middle gap of length 4^-k from each of the
  // 2^(k-1) intervals. The total removed length is 1/2, so the measure of the set is 1/2.
  const inFatCantor = (x, depth = 26) => {
    let lo = 0;
    let hi = 1;
    let gap = 0.25;
    if (x < lo || x > hi) return false;
    for (let k = 1; k <= depth; k += 1) {
      const c = 0.5 * (lo + hi);
      if (x > c - gap / 2 && x < c + gap / 2) return false;
      if (x < c) hi = c - gap / 2; else lo = c + gap / 2;
      gap /= 4;
    }
    return true;
  };

  // Intervals of the set after `depth` steps.
  const cantorIntervals = (depth) => {
    let intervals = [[0, 1]];
    let gap = 0.25;
    for (let k = 1; k <= depth; k += 1) {
      const next = [];
      for (const [lo, hi] of intervals) {
        const c = 0.5 * (lo + hi);
        next.push([lo, c - gap / 2], [c + gap / 2, hi]);
      }
      intervals = next;
      gap /= 4;
    }
    return intervals;
  };

  // Sums of the indicator of the set on n equal cells: the supremum is 1 on the cells that touch
  // the set, the infimum is always 0 (the gaps are dense). Midpoint and random tags in between.
  const cantorSums = (n, depth = 16) => {
    const intervals = cantorIntervals(depth);
    const touched = new Uint8Array(n);
    for (const [lo, hi] of intervals) {
      const first = Math.max(0, Math.floor(lo * n));
      const last = Math.min(n - 1, Math.floor(hi * n));
      for (let i = first; i <= last; i += 1) touched[i] = 1;
    }
    let upper = 0;
    let mid = 0;
    let random = 0;
    for (let i = 0; i < n; i += 1) {
      upper += touched[i];
      if (inFatCantor((i + 0.5) / n)) mid += 1;
      if (inFatCantor((i + Math.random()) / n)) random += 1;
    }
    return { upper: upper / n, lower: 0, mid: mid / n, random: random / n };
  };

  root.IntegrationLab = { FUNCTIONS, riemannMidpoint, lebesgueExact, lebesgueSampled, oddSizes, slope, thomaeSums, pointsAtLeast, inFatCantor, cantorSums, simplestFraction };
})(globalThis);
