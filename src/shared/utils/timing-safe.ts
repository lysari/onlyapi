/**
 * Tiny constant-time string comparison to prevent timing attacks on tokens / secrets.
 */
export const timingSafeEqual = (a: string, b: string): boolean => {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;

  return crypto.subtle
    ? // Bun exposes crypto.subtle – use it
      (() => {
        let mismatch = 0;
        for (let i = 0; i < bufA.byteLength; i++) {
          mismatch |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
        }
        return mismatch === 0;
      })()
    : false;
};
