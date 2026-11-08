/*
 * Numerical methods for the standard normal CDF: quadrature, series, a classical fixed-cost
 * approximation and an efficient implementation through the error function.
 */
((root) => {
  const SQRT2 = Math.SQRT2;
  const SQRT_2PI = Math.sqrt(2 * Math.PI);
  const SQRT_PI = Math.sqrt(Math.PI);

  const phi = (z) => Math.exp(-0.5 * z * z) / SQRT_2PI;

  // ---------------------------------------------------------------- numerical integration
  // Phi(z) = 1/2 + integral of phi on [0, z]; the rules are applied on [0, |z|] with n cells.
  const trapezoid = (z, n) => {
    const b = Math.abs(z);
    const h = b / n;
    let sum = 0.5 * (phi(0) + phi(b));
    for (let i = 1; i < n; i += 1) sum += phi(i * h);
    return 0.5 + Math.sign(z) * sum * h;
  };

  const simpson = (z, n) => { // n even
    const b = Math.abs(z);
    const h = b / n;
    let sum = phi(0) + phi(b);
    for (let i = 1; i < n; i += 1) sum += (i % 2 ? 4 : 2) * phi(i * h);
    return 0.5 + Math.sign(z) * (sum * h) / 3;
  };

  // ---------------------------------------------------------------- series
  // Maclaurin series of phi integrated term by term, alternating:
  // Phi(z) = 1/2 + (1/sqrt(2 pi)) sum (-1)^k z^(2k+1) / (2^k k! (2k+1)).
  const maclaurin = (z, maxTerms = 2000) => {
    let power = z; // (-1)^k z^(2k+1) / (2^k k!)
    let sum = 0;
    let largest = 0;
    let k = 0;
    for (; k < maxTerms; k += 1) {
      const term = power / (2 * k + 1);
      sum += term;
      largest = Math.max(largest, Math.abs(term));
      if (Math.abs(term) <= 1e-17 * Math.abs(sum) && k > 0.5 * z * z) { k += 1; break; }
      power *= (-z * z) / (2 * (k + 1));
    }
    return { value: 0.5 + sum / SQRT_2PI, terms: k, largest: largest / SQRT_2PI };
  };

  // Partial sum of the Maclaurin series with exactly `terms` terms.
  const maclaurinPartial = (z, terms) => {
    let power = z;
    let sum = 0;
    for (let k = 0; k < terms; k += 1) {
      sum += power / (2 * k + 1);
      power *= (-z * z) / (2 * (k + 1));
    }
    return 0.5 + sum / SQRT_2PI;
  };

  // All-positive series, obtained by integrating by parts repeatedly (Marsaglia, 2004):
  // Phi(z) = 1/2 + phi(z) (z + z^3/3 + z^5/(3*5) + ...).
  const positiveSeries = (z, maxTerms = 2000) => {
    let term = z;
    let sum = z;
    let k = 0;
    for (; k < maxTerms; k += 1) {
      term *= (z * z) / (2 * k + 3);
      sum += term;
      if (Math.abs(term) <= 1e-17 * Math.abs(sum)) break;
    }
    return { value: 0.5 + phi(z) * sum, terms: k + 2 };
  };

  // ---------------------------------------------------------------- classical polynomial approximation
  // Abramowitz & Stegun 26.2.17 (Hastings): degree-5 polynomial in 1/(1 + p z), |error| < 7.5e-8.
  const hastings = (z) => {
    const a = Math.abs(z);
    const t = 1 / (1 + 0.2316419 * a);
    const q = phi(a) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z >= 0 ? 1 - q : q;
  };

  // ---------------------------------------------------------------- erf and erfc
  // exp(-x^2) without the rounding error of x*x: x = whole + rest with whole a multiple of 1/16.
  const expMinusSquare = (x) => {
    const whole = Math.floor(16 * x) / 16;
    return Math.exp(-whole * whole) * Math.exp(-(x - whole) * (x + whole));
  };

  // erf(x) for x >= 0 from the all-positive series
  // erf(x) = (2/sqrt(pi)) exp(-x^2) (x + 2x^3/3 + 4x^5/(3*5) + ...).
  const erfSeries = (x, stats) => {
    let term = x;
    let sum = x;
    let k = 0;
    while (Math.abs(term) > 1e-17 * sum && k < 500) {
      term *= (2 * x * x) / (2 * k + 3);
      sum += term;
      k += 1;
    }
    if (stats) stats.iterations = k + 1;
    return (2 / SQRT_PI) * expMinusSquare(x) * sum;
  };

  // erfc(x) for x > 0 from Laplace's continued fraction, evaluated with the modified Lentz method:
  // erfc(x) = (exp(-x^2)/sqrt(pi)) * 1/(x + (1/2)/(x + (2/2)/(x + (3/2)/(x + ...)))).
  const erfcFraction = (x, stats) => {
    const tiny = 1e-300;
    let f = x || tiny;
    let c = f;
    let d = 0;
    let k = 1;
    for (; k < 2000; k += 1) {
      const a = k / 2;
      d = x + a * d;
      d = 1 / (d || tiny);
      c = x + a / (c || tiny);
      const delta = c * d;
      f *= delta;
      if (Math.abs(delta - 1) < 1e-16) break;
    }
    if (stats) stats.iterations = k;
    return (expMinusSquare(x) / SQRT_PI) / f;
  };

  // Below this x the series is used, above it the continued fraction.
  const ERFC_SWITCH = 1.75;

  // erfc for every real x, with full relative accuracy in the right tail.
  const erfc = (x, stats) => {
    if (x < 0) return 2 - erfc(-x, stats);
    return x < ERFC_SWITCH ? 1 - erfSeries(x, stats) : erfcFraction(x, stats);
  };
  const erf = (x, stats) => (x < 0 ? -erf(-x, stats) : (x < ERFC_SWITCH ? erfSeries(x, stats) : 1 - erfcFraction(x, stats)));

  // Phi(z) = erfc(-z / sqrt(2)) / 2, the method proposed on the page.
  const normalCdf = (z, stats) => 0.5 * erfc(-z / SQRT2, stats);

  // ---------------------------------------------------------------- reference values
  // [z, Q(z)] with Q(z) = 1 - Phi(z) = Phi(-z), computed separately with 900-digit decimal
  // arithmetic (positive series, Python's decimal module), rounded to 26 significant digits.
  const REFERENCE = [
    [0.25, 4.0129367431707627575914621e-1], [0.5, 3.0853753872598689636229539e-1],
    [0.75, 2.2662735237686819932706217e-1], [1.0, 1.5865525393145705141476745e-1],
    [1.25, 1.0564977366685525768877276e-1], [1.5, 6.6807201268858066004494041e-2],
    [1.75, 4.0059156863817090418757350e-2], [1.96, 2.4997895148220434136584269e-2],
    [2.0, 2.2750131948179207200282637e-2], [2.25, 1.2224472655044703152623931e-2],
    [2.326, 1.0009275340867667260763553e-2], [2.5, 6.2096653257761351669781046e-3],
    [2.75, 2.9797632350545567542942470e-3], [3.0, 1.3498980316300945266518148e-3],
    [3.25, 5.7702504239076704291691931e-4], [3.5, 2.3262907903552503634992589e-4],
    [3.75, 8.8417285200803867817754669e-5], [4.0, 3.1671241833119921253770757e-5],
    [4.25, 1.0688525774934420469200558e-5], [4.5, 3.3976731247300604016874492e-6],
    [4.75, 1.0170832425687031712591823e-6], [5.0, 2.8665157187919391167375233e-7],
    [5.25, 7.6049605164887142511460651e-8], [5.5, 1.8989562465887719383851274e-8],
    [5.75, 4.4621724539016118730692226e-9], [6.0, 9.8658764503769814070086413e-10],
    [6.25, 2.0522634252189388816227636e-10], [6.5, 4.0160005838591178083461454e-11],
    [6.75, 7.3922577780178224195162297e-12], [7.0, 1.2798125438858350043836237e-12],
    [7.25, 2.0838581586720694311899976e-13], [7.5, 3.1908916729108962277672883e-14],
    [7.75, 4.5946274357785954601554549e-15], [8.0, 6.2209605742717841235159952e-16],
    [8.25, 7.9197263146424773409613744e-17], [8.5, 9.4795348222033183541510505e-18],
    [8.75, 1.0667637375474858002862585e-18], [9.0, 1.1285884059538406477355021e-19],
    [9.25, 1.1224633591327982659521480e-20], [9.5, 1.0494515075362607492834780e-21],
    [9.75, 9.2234135249394181485202262e-23], [10.0, 7.6198530241605260659733433e-24],
    [10.25, 5.9171769073656178503202715e-25], [10.5, 4.3190063178092303465478172e-26],
    [10.75, 2.9630808780943585853031147e-27], [11.0, 1.9106595744986757111504156e-28],
    [11.25, 1.1579603185686417653716811e-29], [11.5, 6.5957714461136750790524721e-31],
    [11.75, 3.5309423958859932586188302e-32], [12.0, 1.7764821120776789976961710e-33],
    [12.5, 3.7325642988777133772258363e-36], [13, 6.1171643995498796822752098e-39],
    [14, 7.7935368191928002543596818e-45], [15, 3.6709661993127508857860897e-51],
    [16, 6.3887544005380872812754826e-58], [18, 9.7409489189371504825918952e-73],
    [20, 2.7536241186062336950756228e-89], [25, 3.0566967063825609164027487e-138],
    [30, 4.9067139271481870595338093e-198], [35, 1.1249107064724062439792428e-268],
    [37.5, 4.6053530095819548438279691e-308],
  ];

  // Web reference: fraction of a normal population within +-z standard deviations, with all the
  // digits printed in the table of https://en.wikipedia.org/wiki/68-95-99.7_rule.
  const WEB_TABLE = [
    [0.5, '0.382924922548026'], [1, '0.682689492137086'], [1.5, '0.866385597462284'], [2, '0.954499736103642'],
    [2.5, '0.987580669348448'], [3, '0.997300203936740'], [3.5, '0.999534741841929'], [4, '0.999936657516334'],
    [4.5, '0.999993204653751'], [5, '0.999999426696856'], [5.5, '0.999999962020875'], [6, '0.999999998026825'],
    [6.5, '0.999999999919680'], [7, '0.999999999997440']
  ];

  root.NormalCdfLab = { phi, trapezoid, simpson, maclaurin, maclaurinPartial, positiveSeries, hastings, erf, erfc, erfSeries, erfcFraction, normalCdf, ERFC_SWITCH, REFERENCE, WEB_TABLE };
})(globalThis);
