import crypto from 'node:crypto'

import { buildSignature, timingSafeCompare } from './signature.util'

describe('timingSafeCompare', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeCompare('abc123', 'abc123')).toBe(true)
  })

  it('returns false for different strings of equal length', () => {
    expect(timingSafeCompare('abc123', 'abc124')).toBe(false)
  })

  it('returns false for strings of different length without throwing', () => {
    expect(timingSafeCompare('abc', 'abcd')).toBe(false)
    expect(timingSafeCompare('', 'x')).toBe(false)
  })

  it('returns true for two empty strings', () => {
    expect(timingSafeCompare('', '')).toBe(true)
  })
})

describe('buildSignature', () => {
  const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex')

  it('joins script name, alphabetically-sorted values, and secret with semicolons', () => {
    const sig = buildSignature('result', { b: '2', a: '1', c: '3' }, 'secret')
    expect(sig).toBe(md5('result;1;2;3;secret'))
  })

  it('produces stable output regardless of insertion order', () => {
    const a = buildSignature('result', { x: '1', y: '2' }, 's')
    const b = buildSignature('result', { y: '2', x: '1' }, 's')
    expect(a).toBe(b)
  })

  it('handles empty params', () => {
    const sig = buildSignature('init_payment.php', {}, 'secret')
    expect(sig).toBe(md5('init_payment.php;secret'))
  })

  it('different secret keys produce different signatures', () => {
    const params = { pg_order_id: 'abc' }
    expect(buildSignature('result', params, 'a')).not.toBe(
      buildSignature('result', params, 'b'),
    )
  })

  it('matches a manually computed reference value', () => {
    const params = {
      pg_merchant_id: '123',
      pg_payment_id: '999',
      pg_order_id: 'abc',
      pg_result: '1',
      pg_amount: '15.00',
      pg_salt: 'aaaa',
    }
    const expected = md5('result;15.00;123;abc;999;1;aaaa;secret')
    expect(buildSignature('result', params, 'secret')).toBe(expected)
  })
})
