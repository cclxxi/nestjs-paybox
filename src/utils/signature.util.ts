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
