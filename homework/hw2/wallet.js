/*
 * Ethereum wallet pipeline, from mnemonic to checksummed address:
 *   BIP-39 (mnemonic -> seed), BIP-32/BIP-44 (seed -> private key),
 *   secp256k1 (private -> public key), Keccak-256 (public key -> address),
 *   EIP-55 (mixed-case checksum).
 * SHA-256, HMAC-SHA512 and PBKDF2 come from the browser's Web Crypto API.
 * Educational code only: never type a real seed phrase into a web page.
 */
(function (root) {
  const subtle = root.crypto.subtle;
  const encoder = new TextEncoder();

  // ------------------------------------------------------------ bytes
  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (hex) => Uint8Array.from(hex.match(/../g) || [], (h) => parseInt(h, 16));
  const concat = (...parts) => {
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  };
  const bytesToBigInt = (bytes) => BigInt(`0x${toHex(bytes) || '0'}`);
  const bigIntToBytes = (value, length = 32) => fromHex(value.toString(16).padStart(length * 2, '0'));
  const ser32 = (i) => Uint8Array.of(i >>> 24, (i >>> 16) & 255, (i >>> 8) & 255, i & 255);

  // ------------------------------------------------------- Keccak-256
  const MASK = (1n << 64n) - 1n;
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];
  // Rotation offsets, index x + 5y.
  const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
  const rotl = (v, n) => (n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK);

  const keccakF = (A) => {
    const C = new Array(5);
    const B = new Array(25);
    for (let round = 0; round < 24; round += 1) {
      for (let x = 0; x < 5; x += 1) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
      for (let x = 0; x < 5; x += 1) {
        const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
        for (let y = 0; y < 25; y += 5) A[x + y] ^= D;
      }
      for (let x = 0; x < 5; x += 1) {
        for (let y = 0; y < 5; y += 1) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], ROT[x + 5 * y]);
      }
      for (let y = 0; y < 25; y += 5) {
        for (let x = 0; x < 5; x += 1) A[x + y] = B[x + y] ^ (~B[((x + 1) % 5) + y] & MASK & B[((x + 2) % 5) + y]);
      }
      A[0] ^= RC[round];
    }
  };

  // Sponge with rate 136 bytes and a 32-byte output. Keccak-256 (Ethereum) pads
  // with 0x01, the NIST standard SHA3-256 pads with 0x06: the only difference.
  const sponge = (message, padByte) => {
    const rate = 136;
    const padded = new Uint8Array((Math.floor(message.length / rate) + 1) * rate);
    padded.set(message);
    padded[message.length] ^= padByte;
    padded[padded.length - 1] ^= 0x80;
    const A = new Array(25).fill(0n);
    for (let offset = 0; offset < padded.length; offset += rate) {
      for (let i = 0; i < rate / 8; i += 1) {
        let lane = 0n;
        for (let b = 7; b >= 0; b -= 1) lane = (lane << 8n) | BigInt(padded[offset + 8 * i + b]);
        A[i] ^= lane;
      }
      keccakF(A);
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 4; i += 1) {
      for (let b = 0; b < 8; b += 1) out[8 * i + b] = Number((A[i] >> BigInt(8 * b)) & 255n);
    }
    return out;
  };
  const keccak256 = (bytes) => sponge(bytes, 0x01);
  const sha3_256 = (bytes) => sponge(bytes, 0x06);

  // -------------------------------------------------------- secp256k1
  const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const G = {
    x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
    y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
  };
  const mod = (a, m = P) => ((a % m) + m) % m;
  const inverse = (a) => {
    let [r0, r1, s0, s1] = [mod(a), P, 1n, 0n];
    while (r1) {
      const q = r0 / r1;
      [r0, r1, s0, s1] = [r1, r0 - q * r1, s1, s0 - q * s1];
    }
    return mod(s0);
  };
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
  const multiply = (k) => {
    let R = null;
    for (const bit of k.toString(2)) {
      R = add(R, R);
      if (bit === '1') R = add(R, G);
    }
    return R;
  };
  const publicKey = (privateKey) => multiply(bytesToBigInt(privateKey));
  const compress = (Q) => concat(Uint8Array.of(Q.y % 2n ? 3 : 2), bigIntToBytes(Q.x));

  // ------------------------------------------------- Web Crypto helpers
  const sha256 = async (bytes) => new Uint8Array(await subtle.digest('SHA-256', bytes));
  const hmacSha512 = async (key, data) => {
    const cryptoKey = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    return new Uint8Array(await subtle.sign('HMAC', cryptoKey, data));
  };

  // ------------------------------------------------------------ BIP-39
  const words = () => root.BIP39_WORDLIST;

  // 128 bits of entropy + 4 checksum bits (first bits of SHA-256) = 132 bits = 12 words of 11 bits.
  const entropyToMnemonic = async (entropy) => {
    const checksumBits = entropy.length / 4;
    const hash = await sha256(entropy);
    const bits = Array.from(entropy, (b) => b.toString(2).padStart(8, '0')).join('')
      + hash[0].toString(2).padStart(8, '0').slice(0, checksumBits);
    return bits.match(/.{11}/g).map((chunk) => words()[parseInt(chunk, 2)]).join(' ');
  };

  // Returns the entropy, or throws if a word is unknown or the checksum is wrong.
  const mnemonicToEntropy = async (mnemonic) => {
    const list = mnemonic.trim().toLowerCase().split(/\s+/);
    if (![12, 15, 18, 21, 24].includes(list.length)) throw new Error('A mnemonic has 12, 15, 18, 21 or 24 words.');
    const bits = list.map((word) => {
      const index = words().indexOf(word);
      if (index < 0) throw new Error(`"${word}" is not in the BIP-39 wordlist.`);
      return index.toString(2).padStart(11, '0');
    }).join('');
    const checksumBits = bits.length / 33;
    const entropy = Uint8Array.from(bits.slice(0, -checksumBits).match(/.{8}/g), (byte) => parseInt(byte, 2));
    const hash = await sha256(entropy);
    if (hash[0].toString(2).padStart(8, '0').slice(0, checksumBits) !== bits.slice(-checksumBits)) {
      throw new Error('Invalid checksum: the last word does not match the others.');
    }
    return entropy;
  };

  // PBKDF2-HMAC-SHA512, 2048 iterations, salt "mnemonic" + passphrase.
  const mnemonicToSeed = async (mnemonic, passphrase = '') => {
    const normalize = (text) => text.normalize('NFKD');
    const key = await subtle.importKey('raw', encoder.encode(normalize(mnemonic.trim().toLowerCase().split(/\s+/).join(' '))), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(normalize(`mnemonic${passphrase}`)), iterations: 2048, hash: 'SHA-512' }, key, 512);
    return new Uint8Array(bits);
  };

  // ------------------------------------------------------- BIP-32 / 44
  const HARDENED = 0x80000000;

  const masterKey = async (seed) => {
    const I = await hmacSha512(encoder.encode('Bitcoin seed'), seed);
    return { key: I.slice(0, 32), chainCode: I.slice(32) };
  };

  const childKey = async ({ key, chainCode }, index) => {
    const data = index >= HARDENED
      ? concat(Uint8Array.of(0), key, ser32(index))
      : concat(compress(publicKey(key)), ser32(index));
    const I = await hmacSha512(chainCode, data);
    const child = mod(bytesToBigInt(I.slice(0, 32)) + bytesToBigInt(key), N);
    return { key: bigIntToBytes(child), chainCode: I.slice(32) };
  };

  // "m/44'/60'/0'/0/0" -> [44 + 2^31, 60 + 2^31, 2^31, 0, 0]
  const parsePath = (path) => path.split('/').slice(1).map((part) => (part.endsWith("'") ? parseInt(part, 10) + HARDENED : parseInt(part, 10)));

  const derivePath = async (seed, path) => {
    let node = await masterKey(seed);
    for (const index of parsePath(path)) node = await childKey(node, index);
    return node;
  };

  // ------------------------------------------------------ address, EIP-55
  const publicKeyBytes = (Q) => concat(bigIntToBytes(Q.x), bigIntToBytes(Q.y)); // 64 bytes, no 04 prefix
  const addressFromPublicKey = (Q) => toHex(keccak256(publicKeyBytes(Q)).slice(12));

  // Uppercase every letter whose nibble in keccak256(lowercase address) is >= 8.
  const toChecksumAddress = (address) => {
    const lower = address.toLowerCase().replace(/^0x/, '');
    const hash = toHex(keccak256(encoder.encode(lower)));
    return `0x${Array.from(lower, (c, i) => (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c)).join('')}`;
  };
  const isValidChecksum = (address) => toChecksumAddress(address) === address;

  // ------------------------------------------------------ full pipeline
  const pipeline = async (mnemonic, { passphrase = '', account = 0 } = {}) => {
    const entropy = await mnemonicToEntropy(mnemonic);
    const seed = await mnemonicToSeed(mnemonic, passphrase);
    const master = await masterKey(seed);
    const path = `m/44'/60'/0'/0/${account}`;
    const { key } = await derivePath(seed, path);
    const Q = publicKey(key);
    const hash = keccak256(publicKeyBytes(Q));
    const address = toHex(hash.slice(12));
    return {
      entropy, seed, master, path, privateKey: key, publicKey: publicKeyBytes(Q),
      hash, address: `0x${address}`, checksummed: toChecksumAddress(address)
    };
  };

  root.Wallet = {
    toHex, fromHex, keccak256, sha3_256, sha256, entropyToMnemonic, mnemonicToEntropy, mnemonicToSeed,
    masterKey, derivePath, publicKey, publicKeyBytes, addressFromPublicKey, toChecksumAddress, isValidChecksum, pipeline
  };
})(globalThis);
