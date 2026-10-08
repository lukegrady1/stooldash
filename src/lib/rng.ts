/** Uniform [0,1) backed by the Web Crypto API. Works in Node 20+, edge and browsers. */
export function cryptoRng(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] as number) / 4294967296;
}

/** Random string from an alphabet using crypto randomness (rejection-sampled, unbiased). */
export function randomString(alphabet: string, length: number): string {
  const n = alphabet.length;
  const max = 256 - (256 % n);
  let out = '';
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < max) out += alphabet[b % n];
      if (out.length === length) break;
    }
  }
  return out;
}
