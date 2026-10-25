/*
 * Random walk S_k = X_1 + ... + X_k with Bernoulli(p) or Rademacher increments,
 * simulated for m attackers over n systems, plus the statistics used on the page.
 */
((root) => {
  const MODELS = {
    // rho = E|X - mu|^3, used by the Berry-Esseen bound.
    bernoulli: (p) => ({ mu: p, sigma2: p * (1 - p), rho: p * (1 - p) * (p * p + (1 - p) * (1 - p)), lattice: 1, min: 0, step: () => (Math.random() < p ? 1 : 0) }),
    rademacher: () => ({ mu: 0, sigma2: 1, rho: 1, lattice: 2, min: -1, step: () => (Math.random() < 0.5 ? 1 : -1) })
  };

  // Log-spaced checkpoints 1..n, used to draw the trajectories.
  const checkpoints = (n, perDecade = 50) => {
    const ks = new Set([1, n]);
    for (let t = 0; t <= Math.log10(n); t += 1 / perDecade) ks.add(Math.round(10 ** t));
    return [...ks].filter((k) => k <= n).sort((a, b) => a - b);
  };

  // m trajectories of length max(ns). Returns S_n for every attacker at every n in `ns`
  // and the full (checkpointed) trajectory of the first `keep` attackers.
  const simulate = ({ model, m, ns, keep = 20 }) => {
    const n = Math.max(...ns);
    const ks = checkpoints(n);
    const finals = Object.fromEntries(ns.map((k) => [k, new Int32Array(m)]));
    const paths = [];
    for (let j = 0; j < m; j += 1) {
      const path = j < keep ? [] : null;
      let s = 0;
      let c = 0;
      for (let k = 1; k <= n; k += 1) {
        s += model.step();
        if (finals[k]) finals[k][j] = s;
        if (path && ks[c] === k) { path.push(s); c += 1; }
      }
      if (path) paths.push(path);
    }
    return { ks, finals, paths };
  };

  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  const variance = (values) => {
    const mu = mean(values);
    return values.reduce((a, v) => a + (v - mu) ** 2, 0) / (values.length - 1);
  };

  // Standard normal CDF (Abramowitz and Stegun 7.1.26, error < 1.5e-7).
  const phi = (x) => {
    const z = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * z);
    const erf = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
    return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
  };
  const normalPdf = (x, mu = 0, s2 = 1) => Math.exp(-((x - mu) ** 2) / (2 * s2)) / Math.sqrt(2 * Math.PI * s2);

  // Kolmogorov-Smirnov distance between the empirical CDF of `values` and N(0, 1).
  const ksDistance = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const m = sorted.length;
    let d = 0;
    for (let i = 0; i < m; i += 1) {
      if (i + 1 < m && sorted[i + 1] === sorted[i]) continue; // jump of a tie group
      let first = i;
      while (first > 0 && sorted[first - 1] === sorted[i]) first -= 1;
      const F = phi(sorted[i]);
      d = Math.max(d, Math.abs((i + 1) / m - F), Math.abs(first / m - F));
    }
    return d;
  };

  // Histogram of the scores S (integers on a lattice of the model) for the quantity S / scale,
  // with bins that contain the same number of lattice points. Returns densities.
  const histogram = (S, { model, n, scale, lo, hi, bins = 30 }) => {
    const d = model.lattice;
    const anchor = model.min * n; // smallest possible score
    const width = d * Math.max(1, Math.round(((hi - lo) * scale) / bins / d));
    const first = Math.floor((lo * scale - anchor + d / 2) / width);
    const last = Math.floor((hi * scale - anchor + d / 2) / width);
    const counts = new Array(Math.max(0, last - first + 1)).fill(0);
    for (const s of S) {
      const j = Math.floor((s - anchor + d / 2) / width) - first;
      if (j >= 0 && j < counts.length) counts[j] += 1;
    }
    return counts.map((c, j) => {
      const start = anchor + (first + j) * width - d / 2;
      return { x0: start / scale, x1: (start + width) / scale, density: c / (S.length * (width / scale)) };
    });
  };

  root.RandomWalk = { MODELS, simulate, mean, variance, phi, normalPdf, ksDistance, histogram };
})(globalThis);
