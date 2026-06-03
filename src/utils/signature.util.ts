import crypto from 'node:crypto'

export function buildSignature(
  scriptName: string,
  params: Record<string, string>,
  secretKey: string,
): string {
  const sorted = Object.keys(params)
    .sort()
    .map(key => params[key])

  const str = [scriptName, ...sorted, secretKey].join(';')
  return crypto.createHash('md5').update(str).digest('hex')
}

/**
 * Constant-time comparison of two signatures. Guards webhook authentication
 * against timing attacks, where comparing with `===` leaks how many leading
 * bytes of the expected signature an attacker has already guessed correctly.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  // timingSafeEqual throws on length mismatch; signature length is not secret.
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}
