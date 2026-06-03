import type { PayboxModuleOptions } from '../interfaces'
import { validatePayboxOptions } from './validate-options.util'

const valid: PayboxModuleOptions = {
  merchantId: '123',
  secretKey: 'secret',
  resultUrl: 'https://app.example/result',
  successUrl: 'https://app.example/success',
  failureUrl: 'https://app.example/failure',
}

describe('validatePayboxOptions', () => {
  it('returns the options unchanged when all required fields are present', () => {
    expect(validatePayboxOptions(valid)).toBe(valid)
  })

  it('throws when a required field is missing', () => {
    const { secretKey: _omit, ...rest } = valid
    expect(() => validatePayboxOptions(rest as PayboxModuleOptions)).toThrow(
      /secretKey/,
    )
  })

  it('throws when a required field is an empty/whitespace string', () => {
    expect(() => validatePayboxOptions({ ...valid, merchantId: '  ' })).toThrow(
      /merchantId/,
    )
  })

  it('lists every missing field in the error message', () => {
    expect(() =>
      validatePayboxOptions({
        merchantId: '1',
        secretKey: 's',
      } as PayboxModuleOptions),
    ).toThrow(/resultUrl, successUrl, failureUrl/)
  })

  it('throws when options is not an object', () => {
    expect(() =>
      validatePayboxOptions(undefined as unknown as PayboxModuleOptions),
    ).toThrow(/options object is required/)
  })
})
