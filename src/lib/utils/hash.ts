// Self-contained hash utilities. SubtleCrypto handles SHA-2 family; MD5 and
// Keccak-256 (SHA-3-256) are implemented inline so we ship zero crypto deps.

export type HashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512' | 'SHA3-256';

export const ALL_ALGOS: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512', 'SHA3-256'];

export async function hashText(algo: HashAlgo, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return hashBytes(algo, bytes);
}

export async function hashBytes(algo: HashAlgo, bytes: Uint8Array): Promise<string> {
  if (algo === 'MD5') return md5Hex(bytes);
  if (algo === 'SHA3-256') return keccak256Hex(bytes);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('SubtleCrypto not available');
  const buf = await subtle.digest(algo, bytes as unknown as BufferSource);
  return bufToHex(buf);
}

export async function hashFile(
  algos: HashAlgo[],
  file: File,
  onProgress?: (loaded: number, total: number) => void
): Promise<Record<HashAlgo, string>> {
  const totalSize = file.size;
  const chunkSize = 1024 * 1024 * 2;
  const chunks: Uint8Array[] = [];
  let offset = 0;
  while (offset < totalSize) {
    const slice = file.slice(offset, Math.min(offset + chunkSize, totalSize));
    const buf = new Uint8Array(await slice.arrayBuffer());
    chunks.push(buf);
    offset += buf.byteLength;
    onProgress?.(offset, totalSize);
  }
  const combined = new Uint8Array(totalSize);
  let o = 0;
  for (const c of chunks) { combined.set(c, o); o += c.byteLength; }
  const result = {} as Record<HashAlgo, string>;
  for (const a of algos) result[a] = await hashBytes(a, combined);
  return result;
}

export function shannonEntropy(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  const freq = new Uint32Array(256);
  for (let i = 0; i < bytes.length; i++) freq[bytes[i]]++;
  let h = 0;
  for (let i = 0; i < 256; i++) {
    const p = freq[i] / bytes.length;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

export function bufToHex(buf: ArrayBuffer | Uint8Array): string {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < view.length; i++) s += view[i].toString(16).padStart(2, '0');
  return s;
}

// MD5 — RFC 1321 reference implementation.
function md5Hex(input: Uint8Array): string {
  const msgLen = input.length;
  const numBlocks = Math.floor((msgLen + 9 + 63) / 64);
  const totalBytes = numBlocks * 64;
  const buf = new Uint8Array(totalBytes);
  buf.set(input, 0);
  buf[msgLen] = 0x80;
  const bitLen = msgLen * 8;
  buf[totalBytes - 8] = bitLen & 0xff;
  buf[totalBytes - 7] = (bitLen >>> 8) & 0xff;
  buf[totalBytes - 6] = (bitLen >>> 16) & 0xff;
  buf[totalBytes - 5] = (bitLen >>> 24) & 0xff;
  const hi = Math.floor(bitLen / 0x100000000);
  buf[totalBytes - 4] = hi & 0xff;
  buf[totalBytes - 3] = (hi >>> 8) & 0xff;
  buf[totalBytes - 2] = (hi >>> 16) & 0xff;
  buf[totalBytes - 1] = (hi >>> 24) & 0xff;

  const T = new Int32Array(64);
  for (let i = 0; i < 64; i++) T[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];

  let a0 = 0x67452301 | 0;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476 | 0;

  const M = new Int32Array(16);
  for (let block = 0; block < numBlocks; block++) {
    const base = block * 64;
    for (let i = 0; i < 16; i++) {
      M[i] = (buf[base + i * 4] |
              (buf[base + i * 4 + 1] << 8) |
              (buf[base + i * 4 + 2] << 16) |
              (buf[base + i * 4 + 3] << 24)) | 0;
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16)      { F = (B & C) | ((~B) & D); g = i; }
      else if (i < 32) { F = (D & B) | ((~D) & C); g = (5 * i + 1) & 15; }
      else if (i < 48) { F = B ^ C ^ D;            g = (3 * i + 5) & 15; }
      else             { F = C ^ (B | (~D));       g = (7 * i) & 15; }
      F = (F + A + T[i] + M[g]) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl32(F, S[i])) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }
  return [a0, b0, c0, d0].map(le32hex).join('');
}

function rotl32(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) | 0;
}
function le32hex(n: number): string {
  return ((n & 0xff)).toString(16).padStart(2, '0') +
         ((n >>> 8) & 0xff).toString(16).padStart(2, '0') +
         ((n >>> 16) & 0xff).toString(16).padStart(2, '0') +
         ((n >>> 24) & 0xff).toString(16).padStart(2, '0');
}

// Keccak / SHA-3-256 — FIPS 202
const MASK64: bigint = 0xffffffffffffffffn;

function keccak256Hex(input: Uint8Array): string {
  const rate = 136;
  const outputLen = 32;
  const dsByte = 0x06;

  const padLen = rate - (input.length % rate);
  const padded = new Uint8Array(input.length + padLen);
  padded.set(input, 0);
  padded[input.length] = dsByte;
  padded[padded.length - 1] |= 0x80;

  const state = new BigUint64Array(25);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let j = 0; j < 8; j++) {
        lane |= BigInt(padded[off + i * 8 + j]) << BigInt(j * 8);
      }
      state[i] ^= lane;
    }
    keccakF(state);
  }

  const out = new Uint8Array(outputLen);
  let written = 0;
  while (written < outputLen) {
    for (let i = 0; i < rate / 8 && written < outputLen; i++) {
      const lane = state[i];
      for (let j = 0; j < 8 && written < outputLen; j++) {
        out[written++] = Number((lane >> BigInt(j * 8)) & 0xffn);
      }
    }
    if (written < outputLen) keccakF(state);
  }
  return bufToHex(out);
}

const KECCAK_RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808An, 0x8000000080008000n,
  0x000000000000808Bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008An, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000An,
  0x000000008000808Bn, 0x800000000000008Bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800An, 0x800000008000000An,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];

const KECCAK_R = [
   0,  1, 62, 28, 27,
  36, 44,  6, 55, 20,
   3, 10, 43, 25, 39,
  41, 45, 15, 21,  8,
  18,  2, 61, 56, 14
];

function rotl64(x: bigint, n: number): bigint {
  const s = BigInt(n);
  return ((x << s) | (x >> (64n - s))) & MASK64;
}

function keccakF(state: BigUint64Array): void {
  for (let round = 0; round < 24; round++) {
    const C = new BigUint64Array(5);
    for (let x = 0; x < 5; x++) {
      C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    const D = new BigUint64Array(5);
    for (let x = 0; x < 5; x++) {
      D[x] = (C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1)) & MASK64;
    }
    for (let i = 0; i < 25; i++) state[i] = (state[i] ^ D[i % 5]) & MASK64;

    const B = new BigUint64Array(25);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const idx = x + 5 * y;
        const newX = y;
        const newY = (2 * x + 3 * y) % 5;
        B[newX + 5 * newY] = rotl64(state[idx], KECCAK_R[idx]);
      }
    }

    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const i = x + 5 * y;
        const i1 = ((x + 1) % 5) + 5 * y;
        const i2 = ((x + 2) % 5) + 5 * y;
        const notB1 = (~B[i1]) & MASK64;
        state[i] = (B[i] ^ (notB1 & B[i2])) & MASK64;
      }
    }

    state[0] = (state[0] ^ KECCAK_RC[round]) & MASK64;
  }
}
