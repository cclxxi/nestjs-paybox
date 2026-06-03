import type { PayboxModuleOptions } from '../interfaces'

const REQUIRED_OPTION_KEYS = [
  'merchantId',
  'secretKey',
  'resultUrl',
  'successUrl',
  'failureUrl',
] as const

/**
 * Fails fast at module init if required Paybox options are missing or empty.
 * Catching this at boot (rather than as silently-failing signatures at the
 * first request) makes misconfiguration obvious.
 */
export function validatePayboxOptions(
  options: PayboxModuleOptions,
): PayboxModuleOptions {
  if (options == null || typeof options !== 'object') {
    throw new Error('PayboxModule: options object is required')
  }

  const missing = REQUIRED_OPTION_KEYS.filter(key => {
    const value = options[key]
    return typeof value !== 'string' || value.trim() === ''
  })

  if (missing.length > 0) {
    throw new Error(
      `PayboxModule: missing required option(s): ${missing.join(', ')}`,
    )
  }

  return options
}
