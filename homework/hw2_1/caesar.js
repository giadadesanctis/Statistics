/*
 * Caesar cipher and its statistical cryptanalysis.
 * The language model (letter and bigram frequencies, common words) is learned
 * from a reference corpus; four attacks recover the key from a ciphertext.
 */
(function (root) {
  const A = 65;
  const a = 97;
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

  // Shifts letters, keeps case, leaves every other character unchanged.
  const shift = (text, key) => {
    const s = ((key % 26) + 26) % 26;
    return text.replace(/[a-z]/gi, (c) => {
      const base = c <= 'Z' ? A : a;
      return String.fromCharCode(base + ((c.charCodeAt(0) - base + s) % 26));
    });
  };
  const encrypt = (text, key) => shift(text, key);
  const decrypt = (text, key) => shift(text, -key);

  const letterIndices = (text) => {
    const out = [];
    for (const c of text.toLowerCase()) {
      const i = c.charCodeAt(0) - a;
      if (i >= 0 && i < 26) out.push(i);
    }
    return out;
  };
  const letterCounts = (text) => {
    const counts = new Array(26).fill(0);
    letterIndices(text).forEach((i) => { counts[i] += 1; });
    return counts;
  };

  // --------------------------------------------------------- language model
  // Symbols 0-25 are letters, 26 is a word boundary (any run of non-letters).
  const symbols = (text) => {
    const out = [26];
    for (const c of text.toLowerCase()) {
      const i = c.charCodeAt(0) - a;
      if (i >= 0 && i < 26) out.push(i);
      else if (out[out.length - 1] !== 26) out.push(26);
    }
    if (out[out.length - 1] !== 26) out.push(26);
    return out;
  };

  const buildModel = (corpus, { commonWords = 300 } = {}) => {
    const counts = letterCounts(corpus);
    const total = counts.reduce((s, c) => s + c, 0);
    const freq = counts.map((c) => c / total);

    // Bigram log-probabilities log P(b | a) with add-one (Laplace) smoothing.
    const pair = Array.from({ length: 27 }, () => new Array(27).fill(1));
    const seq = symbols(corpus);
    for (let i = 1; i < seq.length; i += 1) pair[seq[i - 1]][seq[i]] += 1;
    const logBigram = pair.map((row) => {
      const sum = row.reduce((s, c) => s + c, 0);
      return row.map((c) => Math.log(c / sum));
    });

    const wordCounts = new Map();
    (corpus.toLowerCase().match(/[a-z]+/g) || []).forEach((w) => wordCounts.set(w, (wordCounts.get(w) || 0) + 1));
    const words = new Set([...wordCounts].sort((x, y) => y[1] - x[1]).slice(0, commonWords).map(([w]) => w));

    return { counts, total, freq, logBigram, words, size: corpus.length, distinctWords: wordCounts.size };
  };

  // ------------------------------------------------------------ the attacks
  // Every attack gives a score to each of the 26 keys; the best key wins.
  // `cipherCounts` and `cipherSymbols` are computed once per ciphertext.
  const prepare = (ciphertext) => ({
    text: ciphertext,
    counts: letterCounts(ciphertext),
    symbols: symbols(ciphertext),
    words: ciphertext.toLowerCase().match(/[a-z]+/g) || []
  });

  // Chi-squared distance between the decrypted letter counts and English (lower is better).
  const chiSquared = (prep, model, key) => {
    const n = prep.counts.reduce((s, c) => s + c, 0);
    let chi = 0;
    for (let i = 0; i < 26; i += 1) {
      const observed = prep.counts[(i + key) % 26];
      const expected = n * model.freq[i];
      chi += ((observed - expected) ** 2) / expected;
    }
    return chi;
  };

  // Log-likelihood of the decrypted text under the bigram model (higher is better).
  const bigramScore = (prep, model, key) => {
    const back = (s) => (s === 26 ? 26 : (s - key + 26) % 26);
    let score = 0;
    for (let i = 1; i < prep.symbols.length; i += 1) score += model.logBigram[back(prep.symbols[i - 1])][back(prep.symbols[i])];
    return score;
  };

  // Exhaustive key search judged by a dictionary: share of decrypted words that are common English words.
  const wordScore = (prep, model, key) => {
    if (!prep.words.length) return 0;
    return prep.words.filter((w) => model.words.has(decrypt(w, key))).length / prep.words.length;
  };

  const argBest = (scores, better) => scores.reduce((best, s, i) => (better(s, scores[best]) ? i : best), 0);

  const METHODS = {
    exhaustive: (prep, model) => {
      const scores = Array.from({ length: 26 }, (_, k) => wordScore(prep, model, k));
      return { key: argBest(scores, (x, y) => x > y), scores };
    },
    chiSquared: (prep, model) => {
      const scores = Array.from({ length: 26 }, (_, k) => chiSquared(prep, model, k));
      return { key: argBest(scores, (x, y) => x < y), scores };
    },
    bigram: (prep, model) => {
      const scores = Array.from({ length: 26 }, (_, k) => bigramScore(prep, model, k));
      return { key: argBest(scores, (x, y) => x > y), scores };
    }
  };

  const crack = (ciphertext, model, method = 'chiSquared') => {
    const prep = prepare(ciphertext);
    const result = METHODS[method](prep, model);
    return { ...result, plaintext: decrypt(ciphertext, result.key) };
  };

  // ------------------------------------------------------------ experiment
  // Random snippets of `letters` letters from the test text, each with a random key 1..25.
  const snippet = (text, letters, random = Math.random) => {
    let start = Math.floor(random() * (text.length - letters * 3));
    while (start > 0 && /[a-z]/i.test(text[start - 1])) start -= 1; // begin at a word
    let count = 0;
    let end = start;
    while (end < text.length && count < letters) {
      if (/[a-z]/i.test(text[end])) count += 1;
      end += 1;
    }
    return text.slice(start, end);
  };

  const experiment = (testText, model, { lengths, trials, methods = Object.keys(METHODS) }) => lengths.map((letters) => {
    const wins = Object.fromEntries(methods.map((m) => [m, 0]));
    for (let t = 0; t < trials; t += 1) {
      const key = 1 + Math.floor(Math.random() * 25);
      const prep = prepare(encrypt(snippet(testText, letters), key));
      methods.forEach((m) => { if (METHODS[m](prep, model).key === key) wins[m] += 1; });
    }
    return { letters, rates: Object.fromEntries(methods.map((m) => [m, wins[m] / trials])) };
  });

  root.Caesar = { ALPHABET, encrypt, decrypt, letterCounts, buildModel, crack, METHODS, prepare, chiSquared, bigramScore, snippet, experiment };
})(globalThis);
