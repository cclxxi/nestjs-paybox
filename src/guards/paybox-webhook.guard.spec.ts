import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common'

import type { PayboxModuleOptions } from '../interfaces'
import { buildSignature } from '../utils'
import { PayboxWebhookGuard } from './paybox-webhook.guard'

const baseOptions: PayboxModuleOptions = {
  merchantId: '123',
  secretKey: 'secret',
  resultUrl: 'https://app.example/result',
  successUrl: 'https://app.example/success',
  failureUrl: 'https://app.example/failure',
}

function makeContext(
  req: Partial<{
    body: unknown
    ip: string
    headers: Record<string, string>
    socket: { remoteAddress?: string }
  }>,
): ExecutionContext {
  const fullReq = {
    headers: {},
    socket: {},
    ...req,
  }
  return {
    switchToHttp: () => ({
      getRequest: () => fullReq,
      getResponse: () => ({}),
      getNext: () => () => undefined,
    }),
  } as unknown as ExecutionContext
}

function signedBody(
  extra: Record<string, string>,
  secret = baseOptions.secretKey,
  scriptName = 'result',
) {
  const sig = buildSignature(scriptName, extra, secret)
  return { ...extra, pg_sig: sig }
}

describe('PayboxWebhookGuard', () => {
  it('allows valid signature with no IP whitelist configured', () => {
    const guard = new PayboxWebhookGuard(baseOptions)
    const body = signedBody({
      pg_order_id: '1',
      pg_payment_id: '2',
      pg_result: '1',
    })
    expect(guard.canActivate(makeContext({ body }))).toBe(true)
  })

  it('rejects body with invalid signature', () => {
    const guard = new PayboxWebhookGuard(baseOptions)
    const body = {
      pg_order_id: '1',
      pg_payment_id: '2',
      pg_result: '1',
      pg_sig: 'bogus',
    }
    expect(() => guard.canActivate(makeContext({ body }))).toThrow(
      UnauthorizedException,
    )
  })

  it('rejects body without pg_sig', () => {
    const guard = new PayboxWebhookGuard(baseOptions)
    expect(() =>
      guard.canActivate(makeContext({ body: { pg_order_id: '1' } })),
    ).toThrow(UnauthorizedException)
  })

  it('rejects request when body is missing', () => {
    const guard = new PayboxWebhookGuard(baseOptions)
    expect(() => guard.canActivate(makeContext({}))).toThrow(
      UnauthorizedException,
    )
  })

  it('rejects request from non-whitelisted IP before checking signature', () => {
    const guard = new PayboxWebhookGuard({
      ...baseOptions,
      allowedIps: ['1.1.1.1'],
    })
    const body = signedBody({ pg_order_id: '1' })
    expect(() =>
      guard.canActivate(makeContext({ body, ip: '9.9.9.9' })),
    ).toThrow(ForbiddenException)
  })

  it('honors x-forwarded-for header for IP check', () => {
    const guard = new PayboxWebhookGuard({
      ...baseOptions,
      allowedIps: ['1.1.1.1'],
    })
    const body = signedBody({ pg_order_id: '1' })
    expect(
      guard.canActivate(
        makeContext({
          body,
          headers: { 'x-forwarded-for': '1.1.1.1, 9.9.9.9' },
        }),
      ),
    ).toBe(true)
  })

  it('uses custom resultScriptName from options for verification', () => {
    const opts: PayboxModuleOptions = {
      ...baseOptions,
      resultScriptName: 'custom',
    }
    const guard = new PayboxWebhookGuard(opts)
    const body = signedBody({ pg_order_id: '1' }, opts.secretKey, 'custom')
    expect(guard.canActivate(makeContext({ body }))).toBe(true)
  })
})
