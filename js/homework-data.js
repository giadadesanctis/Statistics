window.homeworkData = [
  {
    number: '07',
    label: 'Homework 6',
    title: 'Statistical Independence: Contingency Tables and the Chi-Square Test on Security Data',
    date: '2026-11-13',
    file: './homework/hw6/index.html',
    tags: ['Independence', 'Hypothesis testing', 'Statistics'],
    description: "Contingency tables built programmatically from raw records of security datasets (authentication logs, IDS-labelled network flows, a phishing simulation, an independent control) or from any pasted bivariate dataset, with joint, marginal and conditional frequencies. Expected frequencies under independence, Pearson's chi-square statistic, its p-value from the incomplete gamma function, a permutation test, Cramér's V and adjusted residuals are used to decide whether the variables are independent, and a confounded antivirus example separates statistical association from causality.",
    status: 'Submitted'
  },
  {
    number: '06',
    label: 'Homework 5',
    title: 'Riemann vs Lebesgue Integration and the Numerical Computation of the Normal CDF',
    date: '2026-11-08',
    file: './homework/hw5/index.html',
    tags: ['Numerical integration', 'Special functions', 'Statistics'],
    description: "Integrals approximated by slicing the domain (Riemann) and by slicing the range and measuring the preimages (Lebesgue), compared in accuracy, convergence and cost on regular, singular and pathological functions such as Dirichlet's, Thomae's and the indicator of a fat Cantor set. The standard normal CDF is shown to be non-elementary through Liouville's theorem, represented exactly with the error function and computed efficiently with a positive series and a continued fraction, checked against a web reference and a 900-digit computation.",
    status: 'Submitted'
  },
  {
    number: '05',
    label: 'Homework 4',
    title: "Welford's Recurrences and the Sampling Mean and Variance of Hackers' Scores",
    date: '2026-10-30',
    file: './homework/hw4/index.html',
    tags: ['Online algorithms', 'Estimation', 'Statistics'],
    description: "Derivation of Knuth's recurrence for the mean and of Welford's recurrences for the sum of squares and the variance, implemented in three lines and compared with the unstable textbook formula. Each of m hackers scores n systems with a Binomial or uniform score between 0 and 10; their Welford sampling means and variances are averaged and compared with the theoretical mean and variance, showing unbiasedness, Bessel's correction, the 1/√n shrinking of the sampling distributions and their role in confidence intervals.",
    status: 'Submitted'
  },
  {
    number: '04',
    label: 'Homework 3',
    title: 'Attackers as Random Walks: Law of Large Numbers and Central Limit Theorem',
    date: '2026-10-25',
    file: './homework/hw3/index.html',
    tags: ['Stochastic processes', 'Simulation', 'Statistics'],
    description: 'The penetration of n systems by m attackers modelled as a random walk with Bernoulli or Rademacher increments. Simulated trajectories and distributions of the total score, the average score and the normalized score show the Law of Large Numbers, how the variance changes under each normalization and the convergence to the standard normal of the Central Limit Theorem, interpreted in terms of system size and number of attackers.',
    status: 'Submitted'
  },
  {
    number: '03',
    label: 'Homework 2',
    title: 'Elliptic Curves vs the Caesar Cipher: Encryption, Statistical Cryptanalysis and Small Key Spaces',
    date: '2026-10-21',
    file: './homework/hw2_1/index.html',
    tags: ['Encryption', 'Cryptanalysis', 'Statistics'],
    description: 'The same message encrypted and decrypted with a toy EC-ElGamal scheme on secp256k1 and with the Caesar cipher, comparing their procedures, key spaces and ciphertext statistics. The Caesar key is recovered from the letter statistics of an English corpus (exhaustive search, chi-squared and bigram scoring, tested on ciphertexts of different lengths), while the toy elliptic-curve key, restricted to 2²⁰ values, falls to brute force and baby-step giant-step.',
    status: 'Submitted'
  },
  {
    number: '02',
    label: 'Homework 1 - Exercise 2',
    title: 'From Wallet Seed to Ethereum Address: Hashing, Key Derivation and Cryptographic Primitives',
    date: '2026-10-13',
    file: './homework/hw2/index.html',
    tags: ['Hashing', 'Key derivation', 'Statistics'],
    description: 'The Ethereum wallet pipeline from a 12-word mnemonic to a checksummed address, implemented step by step: BIP-39, BIP-32, BIP-44, secp256k1, Keccak-256 and EIP-55. The page separates key generation, key derivation, public-key cryptography, hashing, checksums and encoding, places the standards in their historical context and measures their statistical properties.',
    status: 'Submitted'
  },
  {
    number: '01',
    label: 'Homework 1 - Exercise 1',
    title: 'Public-Key Cryptography: From Private Key to Public Key in Ethereum',
    date: '2026-10-10',
    file: './homework/hw1/index.html',
    tags: ['Elliptic curves', 'Cryptography', 'Statistics'],
    description: 'A toy version of how Ethereum turns a private key into a public key with elliptic-curve scalar multiplication on y² = x³ + 7 (mod 17), with an interactive key generator and a slowed-down animation of the algorithm. The resulting points are then explored with statistics (distribution of coordinates and bits, uniformity, correlation, avalanche) to see which properties matter for a one-way function and which belong to hash functions.',
    status: 'Submitted'
  }
];