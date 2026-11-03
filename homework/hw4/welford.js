/*
 * Welford's online algorithm for the mean, the sum of squares and the variance,
 * the score distributions of the hackers and the simulation used on the page.
 */
((root) => {
  // Running mean M_k and sum of squares S_k = sum (x_i - M_k)^2 of a stream.
  class Welford {
    constructor() {
      this.k = 0;
      this.mean = 0;
      this.ss = 0;
    }

    push(x) {
      this.k += 1;
      const delta = x - this.mean; // x_k - M_{k-1}
      this.mean += delta / this.k; // M_k = M_{k-1} + (x_k - M_{k-1}) / k
      this.ss += delta * (x - this.mean); // S_k = S_{k-1} + (x_k - M_{k-1})(x_k - M_k)
      return this;
    }

    get variance() { return this.k > 1 ? this.ss / (this.k - 1) : NaN; } // sample variance s^2
    get populationVariance() { return this.k > 0 ? this.ss / this.k : NaN; }
  }

  // Textbook one-pass formula: (sum x^2 - (sum x)^2 / n) / (n - 1).
  const naiveVariance = (values) => {
    let sum = 0;
    let sumSq = 0;
    for (const x of values) { sum += x; sumSq += x * x; }
    return (sumSq - (sum * sum) / values.length) / (values.length - 1);
  };

  // Two passes: mean first, then squared deviations.
  const twoPassVariance = (values) => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((a, x) => a + (x - mean) ** 2, 0) / (values.length - 1);
  };

  const welfordVariance = (values) => values.reduce((w, x) => w.push(x), new Welford()).variance;

  // ---------------------------------------------------------------- score distributions on [0, 10]
  // mu = E[X], sigma2 = Var(X), mu4 = E[(X - mu)^4]; lattice = spacing of the values (0 if continuous).
  const binomialPmf = (N, p) => {
    const pmf = [];
    let c = 1;
    for (let k = 0; k <= N; k += 1) {
      pmf.push(c * p ** k * (1 - p) ** (N - k));
      c = (c * (N - k)) / (k + 1);
    }
    return pmf;
  };

  // Discrete distribution on 0..10 from its pmf; samples with the inverse CDF.
  const discrete = (pmf) => {
    const mu = pmf.reduce((a, q, x) => a + q * x, 0);
    const central = (r) => pmf.reduce((a, q, x) => a + q * (x - mu) ** r, 0);
    const cdf = [];
    pmf.reduce((a, q) => { cdf.push(a + q); return a + q; }, 0);
    return {
      mu,
      sigma2: central(2),
      mu4: central(4),
      lattice: 1,
      pmf,
      sample: () => {
        const u = Math.random();
        const i = cdf.findIndex((c) => u < c);
        return i < 0 ? pmf.length - 1 : i;
      }
    };
  };

  const DISTRIBUTIONS = {
    binomial: (p) => discrete(binomialPmf(10, p)),
    uniformDiscrete: () => discrete(new Array(11).fill(1 / 11)),
    uniformContinuous: () => ({ mu: 5, sigma2: 100 / 12, mu4: 10 ** 4 / 80, lattice: 0, pmf: null, sample: () => 10 * Math.random() })
  };

  // Var(s^2) for i.i.d. samples of size n: (mu4 - sigma^4 (n - 3) / (n - 1)) / n.
  const varianceOfS2 = (dist, n) => (dist.mu4 - (dist.sigma2 ** 2 * (n - 3)) / (n - 1)) / n;

  // Log-spaced checkpoints 2..n, used to draw the running trajectories.
  const checkpoints = (n, perDecade = 40) => {
    const ks = new Set([2, n]);
    for (let t = Math.log10(2); t <= Math.log10(n); t += 1 / perDecade) ks.add(Math.round(10 ** t));
    return [...ks].filter((k) => k >= 2 && k <= n).sort((a, b) => a - b);
  };

  // m hackers, each attacking max(ns) systems. One Welford accumulator per hacker: the sampling
  // mean and variance after n systems are read from the stream at every n in `ns`. The running
  // trajectories of the first `keep` hackers are stored at the checkpoints.
  const simulate = ({ dist, m, ns, keep = 20 }) => {
    const n = Math.max(...ns);
    const ks = checkpoints(n);
    const means = Object.fromEntries(ns.map((k) => [k, new Float64Array(m)]));
    const variances = Object.fromEntries(ns.map((k) => [k, new Float64Array(m)]));
    const paths = [];
    for (let j = 0; j < m; j += 1) {
      const w = new Welford();
      const path = j < keep ? { mean: [], variance: [] } : null;
      let c = 0;
      for (let k = 1; k <= n; k += 1) {
        w.push(dist.sample());
        if (means[k]) { means[k][j] = w.mean; variances[k][j] = w.variance; }
        if (path && ks[c] === k) { path.mean.push(w.mean); path.variance.push(w.variance); c += 1; }
      }
      if (path) paths.push(path);
    }
    return { ks, means, variances, paths };
  };

  // Mean and sample variance of an array, computed with Welford as well.
  const summary = (values) => {
    const w = new Welford();
    for (const v of values) w.push(v);
    return { mean: w.mean, variance: w.variance };
  };

  const normalPdf = (x, mu = 0, s2 = 1) => Math.exp(-((x - mu) ** 2) / (2 * s2)) / Math.sqrt(2 * Math.PI * s2);

  // Histogram with equal-width bins; for lattice data the width is a multiple of the lattice
  // step and the bins are centred on lattice points. Returns densities.
  const histogram = (values, { lo, hi, bins = 30, lattice = 0 }) => {
    let width = (hi - lo) / bins;
    let start = lo;
    if (lattice > 0) {
      width = lattice * Math.max(1, Math.round(width / lattice));
      start = Math.floor(lo / lattice) * lattice - lattice / 2;
    }
    const count = Math.max(1, Math.ceil((hi - start) / width));
    const counts = new Array(count).fill(0);
    for (const v of values) {
      const j = Math.floor((v - start) / width + 1e-9);
      if (j >= 0 && j < count) counts[j] += 1;
    }
    return counts.map((c, j) => ({ x0: start + j * width, x1: start + (j + 1) * width, density: c / (values.length * width) }));
  };

  root.WelfordLab = { Welford, naiveVariance, twoPassVariance, welfordVariance, DISTRIBUTIONS, varianceOfS2, simulate, summary, normalPdf, histogram };
})(globalThis);
