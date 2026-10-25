window.homeworkData = [
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