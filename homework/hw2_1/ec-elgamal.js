/*
 * Toy EC-ElGamal encryption on secp256k1 with a restricted private key 1 <= k <= 2^bits,
 * and two attacks that exploit the restriction: brute force and baby-step giant-step.
 * Messages are mapped to curve points with Koblitz's method. Every number is a BigInt.
 * Educational code only: never use it to protect real data.
 */
(function (root) {
  const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const G = {
    x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
    y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
  };
  const BLOCK_BYTES = 30; // 240 message bits + 8 bits for the Koblitz counter < 256 bits of x
  const KOBLITZ = 256n;

  const mod = (a, m = P) => ((a % m) + m) % m;
  const inverse = (a, m = P) => {
    let [r0, r1, s0, s1] = [mod(a, m), m, 1n, 0n];
    while (r1) {
      const q = r0 / r1;
      [r0, r1, s0, s1] = [r1, r0 - q * r1, s1, s0 - q * s1];
    }
    return mod(s0, m);
  };
  const power = (base, exponent, m = P) => {
    let result = 1n;
    let b = mod(base, m);
    for (let e = exponent; e > 0n; e >>= 1n) {
      if (e & 1n) result = (result * b) % m;
      b = (b * b) % m;
    }
    return result;
  };

  // ------------------------------------------------- affine point arithmetic
  // The point at infinity O is null.
  const isOnCurve = (A) => A === null || mod(A.y * A.y - A.x * A.x * A.x - 7n) === 0n;
  const negate = (A) => (A === null ? null : { x: A.x, y: mod(-A.y) });
  const add = (A, B) => {
    if (!A) return B;
    if (!B) return A;
    if (A.x === B.x && mod(A.y + B.y) === 0n) return null;
    const lambda = A.x === B.x
      ? mod(3n * A.x * A.x * inverse(2n * A.y))
      : mod((B.y - A.y) * inverse(B.x - A.x));
    const x = mod(lambda * lambda - A.x - B.x);
    return { x, y: mod(lambda * (A.x - x) - A.y) };
  };
  const subtract = (A, B) => add(A, negate(B));

  // ------------------------------------- Jacobian coordinates (no inversions)
  // (X, Y, Z) stands for the affine point (X / Z^2, Y / Z^3); Z = 0 is O.
  const J_INFINITY = { X: 1n, Y: 1n, Z: 0n };
  const toJacobian = (A) => (A ? { X: A.x, Y: A.y, Z: 1n } : J_INFINITY);
  const toAffine = ({ X, Y, Z }) => {
    if (Z === 0n) return null;
    const zInv = inverse(Z);
    const zInv2 = (zInv * zInv) % P;
    return { x: (X * zInv2) % P, y: (((Y * zInv2) % P) * zInv) % P };
  };
  const jDouble = ({ X, Y, Z }) => {
    if (Z === 0n || Y === 0n) return J_INFINITY;
    const YY = (Y * Y) % P;
    const S = (4n * X * YY) % P;
    const M = (3n * X * X) % P; // a = 0 on secp256k1
    const X3 = mod(M * M - 2n * S);
    return { X: X3, Y: mod(M * (S - X3) - 8n * YY * YY), Z: (2n * Y * Z) % P };
  };
  // Mixed addition: Jacobian point + affine point.
  const jAddAffine = (A, B) => {
    if (!B) return A;
    if (A.Z === 0n) return toJacobian(B);
    const Z2 = (A.Z * A.Z) % P;
    const U2 = (B.x * Z2) % P;
    const S2 = (((B.y * Z2) % P) * A.Z) % P;
    const H = mod(U2 - A.X);
    const R = mod(S2 - A.Y);
    if (H === 0n) return R === 0n ? jDouble(A) : J_INFINITY;
    const HH = (H * H) % P;
    const HHH = (HH * H) % P;
    const V = (A.X * HH) % P;
    const X3 = mod(R * R - HHH - 2n * V);
    return { X: X3, Y: mod(R * (V - X3) - A.Y * HHH), Z: (A.Z * H) % P };
  };

  // Left-to-right double-and-add, as in Homework 1.
  const multiply = (k, A = G) => {
    let R = J_INFINITY;
    for (const bit of mod(BigInt(k), N).toString(2)) {
      R = jDouble(R);
      if (bit === '1') R = jAddAffine(R, A);
    }
    return toAffine(R);
  };

  // ----------------------------------------------------------- randomness
  const randomBelow = (limit) => {
    const bytes = Math.ceil(limit.toString(2).length / 8) + 8; // extra bytes make the modulo bias negligible
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
    return BigInt(`0x${hex}`) % limit;
  };
  const randomScalar = () => 1n + randomBelow(N - 1n); // 1 <= r <= n - 1

  // ----------------------------------------------------------------- keys
  const generateKeyPair = (bits) => {
    const k = 1n + randomBelow(1n << BigInt(bits)); // 1 <= k <= 2^bits: the toy restriction
    return { k, Q: multiply(k), bits };
  };

  // --------------------------------------------- Koblitz message encoding
  // x = m * 256 + j for the first j that makes x^3 + 7 a square modulo p.
  // p = 3 (mod 4), so the square root is a^((p + 1) / 4).
  const SQRT_EXP = (P + 1n) / 4n;
  const encodeBlock = (bytes) => {
    let m = 0n;
    for (const b of bytes) m = (m << 8n) | BigInt(b);
    for (let j = 0n; j < KOBLITZ; j += 1n) {
      const x = m * KOBLITZ + j;
      const rhs = mod(x * x * x + 7n);
      const y = power(rhs, SQRT_EXP);
      if ((y * y) % P === rhs) return { point: { x, y }, m, j: Number(j) };
    }
    throw new Error('No point found for this block');
  };
  const decodeBlock = (M, length) => {
    let m = M.x / KOBLITZ;
    const bytes = new Uint8Array(length);
    for (let i = length - 1; i >= 0; i -= 1) {
      bytes[i] = Number(m & 255n);
      m >>= 8n;
    }
    return bytes;
  };

  // ------------------------------------------------------ encrypt / decrypt
  // Each block: fresh ephemeral r, C1 = rG, C2 = M + rQ.
  const encrypt = (message, Q) => {
    const bytes = new TextEncoder().encode(message);
    const blocks = [];
    for (let i = 0; i < bytes.length; i += BLOCK_BYTES) {
      const chunk = bytes.slice(i, i + BLOCK_BYTES);
      const { point: M, m, j } = encodeBlock(chunk);
      const r = randomScalar();
      const S = multiply(r, Q);
      blocks.push({ length: chunk.length, m, j, M, r, S, C1: multiply(r), C2: add(M, S) });
    }
    return blocks;
  };

  // M = C2 - kC1, because kC1 = k(rG) = r(kG) = rQ.
  const decrypt = (blocks, k) => {
    const decoded = blocks.map(({ C1, C2, length }) => {
      if (!isOnCurve(C1) || !isOnCurve(C2)) throw new Error('Ciphertext point not on secp256k1');
      const S = multiply(k, C1);
      const M = subtract(C2, S);
      return { S, M, bytes: decodeBlock(M, length) };
    });
    const all = new Uint8Array(decoded.reduce((n, d) => n + d.bytes.length, 0));
    let offset = 0;
    decoded.forEach((d) => { all.set(d.bytes, offset); offset += d.bytes.length; });
    return { blocks: decoded, text: new TextDecoder().decode(all) };
  };

  // --------------------------------------------------------------- attacks
  const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

  // Brute force: R_i = iG for i = 1, 2, ... until R_i = Q. One mixed addition per key.
  // The comparison X == Qx * Z^2 avoids an inversion at every step.
  const bruteForce = async (Q, bits, { chunk = 4096 } = {}) => {
    const limit = 1n << BigInt(bits);
    let R = J_INFINITY;
    const start = performance.now();
    for (let i = 1n; i <= limit; i += 1n) {
      R = jAddAffine(R, G);
      const Z2 = (R.Z * R.Z) % P;
      if (R.X === (Q.x * Z2) % P && R.Y === (((Q.y * Z2) % P) * R.Z) % P) {
        return { k: i, operations: Number(i), ms: performance.now() - start };
      }
      if (i % BigInt(chunk) === 0n) {
        await nextFrame();
      }
    }
    return { k: null, operations: Number(limit), ms: performance.now() - start };
  };

  // Baby-step giant-step: write k = i*m + j with m = ceil(sqrt(2^bits)).
  // Store jG for j = 0..m-1, then look for Q - i(mG) in the table.
  const babyStepGiantStep = async (Q, bits, { chunk = 2048 } = {}) => {
    const m = BigInt(Math.ceil(Math.sqrt(2 ** bits + 1)));
    const start = performance.now();
    const table = new Map();
    let R = null;
    for (let j = 0n; j < m; j += 1n) {
      table.set(R === null ? 'O' : R.x.toString(16) + (R.y & 1n), j);
      R = add(R, G);
      if (j % BigInt(chunk) === 0n) {
        await nextFrame();
      }
    }
    const giant = negate(multiply(m)); // -mG
    let T = Q;
    for (let i = 0n; i <= m; i += 1n) {
      const j = table.get(T === null ? 'O' : T.x.toString(16) + (T.y & 1n));
      if (j !== undefined) {
        const k = i * m + j;
        return { k, operations: Number(m + i + 1n), tableSize: Number(m), ms: performance.now() - start };
      }
      T = add(T, giant);
      if (i % BigInt(chunk) === 0n) {
        await nextFrame();
      }
    }
    return { k: null, operations: Number(2n * m), tableSize: Number(m), ms: performance.now() - start };
  };

  // --------------------------------------------------------------- display
  const hex = (value, digits = 64) => value.toString(16).padStart(digits, '0');
  const compressed = (A) => (A ? `${A.y & 1n ? '03' : '02'}${hex(A.x)}` : '00');

  root.ECElGamal = {
    P, N, G, BLOCK_BYTES, mod, inverse, add, subtract, negate, multiply, isOnCurve,
    randomScalar, generateKeyPair, encodeBlock, decodeBlock, encrypt, decrypt,
    bruteForce, babyStepGiantStep, hex, compressed
  };
})(globalThis);
