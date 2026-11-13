/*
 * Contingency tables, marginal and conditional frequencies, expected frequencies under
 * independence, Pearson's chi-square statistic with its p-value, Cramér's V, a permutation
 * test and the datasets used on the page. No dependencies; works in the browser and in Node.
 */
((root) => {
  // ---------------------------------------------------------------- random numbers
  // mulberry32: small seeded generator, so that every dataset is reproducible.
  const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Index drawn from a discrete distribution given by its probabilities.
  const pick = (random, probs) => {
    let u = random();
    for (let i = 0; i < probs.length - 1; i += 1) {
      u -= probs[i];
      if (u < 0) return i;
    }
    return probs.length - 1;
  };

  // ---------------------------------------------------------------- the contingency table
  // records: array of [x, f] pairs (the raw data, one pair per observation).
  // Categories keep the order given in xOrder / fOrder, or the order of first appearance.
  const contingency = (records, xOrder = null, fOrder = null) => {
    const xs = xOrder ? [...xOrder] : [];
    const fs = fOrder ? [...fOrder] : [];
    const xIndex = new Map(xs.map((v, i) => [v, i]));
    const fIndex = new Map(fs.map((v, j) => [v, j]));
    const cells = [];
    for (const [x, f] of records) {
      if (!xIndex.has(x)) { xIndex.set(x, xs.length); xs.push(x); }
      if (!fIndex.has(f)) { fIndex.set(f, fs.length); fs.push(f); }
      cells.push([xIndex.get(x), fIndex.get(f)]);
    }
    const counts = xs.map(() => fs.map(() => 0));
    for (const [i, j] of cells) counts[i][j] += 1; // n_ij: one pass over the records
    const rowTotals = counts.map((row) => row.reduce((a, b) => a + b, 0)); // n_i.
    const colTotals = fs.map((_, j) => counts.reduce((a, row) => a + row[j], 0)); // n_.j
    const n = rowTotals.reduce((a, b) => a + b, 0);
    return { xs, fs, counts, rowTotals, colTotals, n };
  };

  // Joint, marginal and conditional relative frequencies.
  const frequencies = ({ counts, rowTotals, colTotals, n }) => ({
    joint: counts.map((row) => row.map((c) => c / n)), // f_ij = n_ij / n
    rowMarginal: rowTotals.map((t) => t / n), // f_i. = n_i. / n
    colMarginal: colTotals.map((t) => t / n), // f_.j = n_.j / n
    rowProfiles: counts.map((row, i) => row.map((c) => (rowTotals[i] ? c / rowTotals[i] : NaN))), // f(F = j | X = i)
    colProfiles: counts.map((row) => row.map((c, j) => (colTotals[j] ? c / colTotals[j] : NaN))) // f(X = i | F = j)
  });

  // Expected counts under independence: e_ij = n_i. n_.j / n.
  const expected = ({ rowTotals, colTotals, n }) => rowTotals.map((r) => colTotals.map((c) => (r * c) / n));

  // Pearson's statistic, cell contributions, Pearson and adjusted (standardized) residuals.
  const chiSquare = (table) => {
    const { counts, rowTotals, colTotals, n } = table;
    const E = expected(table);
    const contributions = counts.map((row, i) => row.map((o, j) => (E[i][j] > 0 ? (o - E[i][j]) ** 2 / E[i][j] : 0)));
    const residuals = counts.map((row, i) => row.map((o, j) => (E[i][j] > 0 ? (o - E[i][j]) / Math.sqrt(E[i][j]) : 0)));
    // Adjusted residual: approximately N(0, 1) in each cell under independence.
    const adjusted = counts.map((row, i) => row.map((o, j) => {
      const v = E[i][j] * (1 - rowTotals[i] / n) * (1 - colTotals[j] / n);
      return v > 0 ? (o - E[i][j]) / Math.sqrt(v) : 0;
    }));
    const stat = contributions.flat().reduce((a, b) => a + b, 0);
    // Empty rows or columns carry no information and do not count as categories.
    const r = rowTotals.filter((t) => t > 0).length;
    const c = colTotals.filter((t) => t > 0).length;
    const df = (r - 1) * (c - 1);
    const minExpected = Math.min(...E.flat().filter((e) => e > 0));
    const smallCells = E.flat().filter((e) => e > 0 && e < 5).length;
    const k = Math.min(r, c) - 1;
    return {
      expected: E,
      contributions,
      residuals,
      adjusted,
      stat,
      df,
      pValue: df > 0 ? chiSquareSf(stat, df) : NaN,
      cramersV: k > 0 ? Math.sqrt(stat / (n * k)) : NaN,
      minExpected,
      smallCells,
      cellCount: r * c
    };
  };

  // Same statistic from the shortcut chi2 = n (sum n_ij^2 / (n_i. n_.j) - 1), used as a check.
  const chiSquareShortcut = ({ counts, rowTotals, colTotals, n }) => {
    let s = 0;
    counts.forEach((row, i) => row.forEach((o, j) => { if (rowTotals[i] && colTotals[j]) s += (o * o) / (rowTotals[i] * colTotals[j]); }));
    return n * (s - 1);
  };

  // ---------------------------------------------------------------- the chi-square distribution
  // log Gamma by the Lanczos approximation (g = 7, 9 terms), about 15 digits for x > 0.
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  const logGamma = (x) => {
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
    const z = x - 1;
    let a = LANCZOS[0];
    const t = z + 7.5;
    for (let i = 1; i < 9; i += 1) a += LANCZOS[i] / (z + i);
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
  };

  // Regularized incomplete gamma functions P(a, x) and Q(a, x) = 1 - P(a, x).
  // Series for x < a + 1, Lentz continued fraction otherwise: each is used where it
  // converges fast, and Q is computed directly in the tail, so tiny p-values keep their digits.
  const gammaP = (a, x) => {
    if (x <= 0) return 0;
    if (x < a + 1) {
      let term = 1 / a;
      let sum = term;
      for (let k = 1; k < 1000; k += 1) {
        term *= x / (a + k);
        sum += term;
        if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
      }
      return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    }
    return 1 - gammaQ(a, x);
  };
  const gammaQ = (a, x) => {
    if (x <= 0) return 1;
    if (x < a + 1) return 1 - gammaP(a, x);
    const tiny = 1e-300;
    let b = x + 1 - a;
    let c = 1 / tiny;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i < 1000; i += 1) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < tiny) d = tiny;
      c = b + an / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
  };

  const chiSquareCdf = (x, k) => gammaP(k / 2, x / 2);
  const chiSquareSf = (x, k) => gammaQ(k / 2, x / 2); // p-value = P(chi2_k >= x)
  const chiSquarePdf = (x, k) => {
    if (x < 0) return 0;
    if (x === 0) return k === 2 ? 0.5 : k < 2 ? Infinity : 0;
    return Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.LN2 - logGamma(k / 2));
  };

  // Critical value: the x with P(chi2_k >= x) = alpha, by bisection on the survival function.
  const chiSquareQuantile = (alpha, k) => {
    let lo = 0;
    let hi = Math.max(10, 4 * k);
    while (chiSquareSf(hi, k) > alpha) hi *= 2;
    for (let i = 0; i < 200; i += 1) {
      const mid = 0.5 * (lo + hi);
      if (chiSquareSf(mid, k) > alpha) lo = mid; else hi = mid;
      if (hi - lo < 1e-12 * hi) break;
    }
    return 0.5 * (lo + hi);
  };

  // ---------------------------------------------------------------- permutation test
  // Shuffling the F labels keeps both margins and destroys any link between X and F:
  // the shuffled tables are draws from the distribution of the table under independence.
  const permutationTest = (table, records, B = 2000, seed = 7) => {
    const random = rng(seed);
    const xi = new Map(table.xs.map((v, i) => [v, i]));
    const fj = new Map(table.fs.map((v, j) => [v, j]));
    const X = Int32Array.from(records, ([x]) => xi.get(x));
    const F = Int32Array.from(records, ([, f]) => fj.get(f));
    const r = table.xs.length;
    const c = table.fs.length;
    const E = expected(table);
    const counts = new Float64Array(r * c);
    const observed = chiSquare(table).stat;
    const stats = new Float64Array(B);
    let atLeast = 0;
    for (let b = 0; b < B; b += 1) {
      for (let k = F.length - 1; k > 0; k -= 1) { // Fisher-Yates shuffle
        const m = Math.floor(random() * (k + 1));
        const t = F[k]; F[k] = F[m]; F[m] = t;
      }
      counts.fill(0);
      for (let k = 0; k < X.length; k += 1) counts[X[k] * c + F[k]] += 1;
      let s = 0;
      for (let i = 0; i < r; i += 1) {
        for (let j = 0; j < c; j += 1) {
          const e = E[i][j];
          if (e > 0) s += (counts[i * c + j] - e) ** 2 / e;
        }
      }
      stats[b] = s;
      if (s >= observed - 1e-9) atLeast += 1;
    }
    // (1 + count) / (1 + B): a valid p-value that is never exactly zero.
    return { stats, observed, pValue: (1 + atLeast) / (1 + B), B };
  };

  // ---------------------------------------------------------------- CSV input
  // Two columns (X, F) separated by a comma, a semicolon or a tab. A first line whose
  // fields look like names is used as the header.
  const parseCsv = (text) => {
    const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (!lines.length) throw new Error('The data are empty.');
    const sep = [',', ';', '\t'].find((s) => lines[0].includes(s));
    if (!sep) throw new Error('Each line needs two values separated by a comma, a semicolon or a tab.');
    const rows = lines.map((l) => l.split(sep).map((v) => v.trim().replace(/^"(.*)"$/, '$1')));
    const bad = rows.findIndex((r) => r.length < 2 || r[0] === '' || r[1] === '');
    if (bad >= 0) throw new Error(`Line ${bad + 1} does not have two values.`);
    let names = ['X', 'F'];
    // The first row is a header when neither of its values occurs again in its column.
    const rest = rows.slice(1);
    if (rest.length && !rest.some((r) => r[0] === rows[0][0]) && !rest.some((r) => r[1] === rows[0][1])) names = rows.shift().slice(0, 2);
    if (rows.length < 2) throw new Error('At least two observations are needed.');
    return { names, records: rows.map((r) => [r[0], r[1]]) };
  };

  // ---------------------------------------------------------------- datasets
  // Each dataset is generated record by record from a model, so that the table is really
  // built from raw data. The model is described on the page; the seed fixes the sample.
  const sample = (seed, n, xLevels, xProbs, fLevels, fGivenX) => {
    const random = rng(seed);
    const records = [];
    for (let k = 0; k < n; k += 1) {
      const i = pick(random, xProbs);
      const j = pick(random, fGivenX[i]);
      records.push([xLevels[i], fLevels[j]]);
    }
    return records;
  };

  // Endpoint telemetry with a confounder Z = environment: within each environment the
  // antivirus status and the infection are independent by construction.
  const endpointRecords = (seed = 22) => {
    const random = rng(seed);
    const records = [];
    const strata = [
      { z: 'Corporate', n: 1200, av: 0.85, infected: 0.04 },
      { z: 'Home', n: 800, av: 0.30, infected: 0.22 }
    ];
    for (const s of strata) {
      for (let k = 0; k < s.n; k += 1) {
        const av = random() < s.av ? 'Installed' : 'Not installed';
        const inf = random() < s.infected ? 'Infected' : 'Clean';
        records.push([av, inf, s.z]);
      }
    }
    return records;
  };

  const DATASETS = [
    {
      id: 'logins',
      title: 'Authentication log',
      xName: 'Time of day',
      fName: 'Outcome',
      xs: ['Night (00–06)', 'Morning (06–12)', 'Afternoon (12–18)', 'Evening (18–24)'],
      fs: ['Success', 'Failure'],
      model: 'Login attempts on a VPN gateway. Automated password guessing is concentrated at night, so the probability of a failed login is set to 0.38 at night and to 0.08–0.14 in the other bands.',
      records: () => sample(2026, 2000, DATASETS[0].xs, [0.16, 0.3, 0.34, 0.2], DATASETS[0].fs, [[0.62, 0.38], [0.9, 0.1], [0.92, 0.08], [0.86, 0.14]])
    },
    {
      id: 'ids',
      title: 'Network flows and IDS alerts',
      xName: 'Protocol',
      fName: 'IDS label',
      xs: ['TCP', 'UDP', 'ICMP'],
      fs: ['Normal', 'DoS', 'Probe'],
      model: 'Flows labelled by an intrusion detection system, in the spirit of the KDD/NSL-KDD data. ICMP is used by ping sweeps and floods, so its flows are much more often labelled Probe or DoS.',
      records: () => sample(46739, 3000, DATASETS[1].xs, [0.7, 0.2, 0.1], DATASETS[1].fs, [[0.8, 0.12, 0.08], [0.85, 0.1, 0.05], [0.45, 0.25, 0.3]])
    },
    {
      id: 'ports',
      title: 'Server and source-port parity (control)',
      xName: 'Destination server',
      fName: 'Source port parity',
      xs: ['web-01', 'web-02', 'web-03', 'db-01'],
      fs: ['Even', 'Odd'],
      model: 'Connections to four servers. The client picks its ephemeral source port at random, independently of the server, so the parity of the port is independent of the server by construction: a control where H₀ is true.',
      records: () => sample(3, 2000, DATASETS[2].xs, [0.3, 0.3, 0.25, 0.15], DATASETS[2].fs, [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]])
    },
    {
      id: 'phishing',
      title: 'Phishing simulation',
      xName: 'Department',
      fName: 'Reaction',
      xs: ['IT', 'HR', 'Finance', 'Sales'],
      fs: ['Reported', 'Ignored', 'Clicked'],
      model: 'A simulated phishing campaign sent to 400 employees. The click rates are 6% in IT and 12–18% elsewhere: a real but moderate difference, with a small sample.',
      records: () => sample(5, 400, DATASETS[3].xs, [0.2, 0.15, 0.25, 0.4], DATASETS[3].fs, [[0.4, 0.54, 0.06], [0.2, 0.62, 0.18], [0.25, 0.63, 0.12], [0.18, 0.66, 0.16]])
    },
    {
      id: 'endpoint',
      title: 'Endpoint telemetry (pooled)',
      xName: 'Antivirus',
      fName: 'Status',
      xs: ['Installed', 'Not installed'],
      fs: ['Clean', 'Infected'],
      model: 'Corporate and home machines mixed together. Within each environment the antivirus status is independent of the infection; corporate machines are both more often protected and less exposed. See the section on causality.',
      records: () => endpointRecords().map(([x, f]) => [x, f])
    }
  ];

  root.IndependenceLab = {
    rng,
    contingency,
    frequencies,
    expected,
    chiSquare,
    chiSquareShortcut,
    logGamma,
    gammaP,
    gammaQ,
    chiSquareCdf,
    chiSquareSf,
    chiSquarePdf,
    chiSquareQuantile,
    permutationTest,
    parseCsv,
    endpointRecords,
    DATASETS
  };
})(typeof window !== 'undefined' ? window : globalThis);
