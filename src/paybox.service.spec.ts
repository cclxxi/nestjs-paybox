import { Test } from '@nestjs/testing'

import { PayboxHttpService } from './http/paybox-http.service'
import { ProviderPaymentStatus } from './interfaces'
import { PAYBOX_OPTIONS } from './paybox.constants'
import { PayboxService } from './paybox.service'
import { buildSignature } from './utils'

const baseOptions = {
  merchantId: '123',
  secretKey: 'secret',
  resultUrl: 'https://app.example/result',
  successUrl: 'https://app.example/success',
  failureUrl: 'https://app.example/failure',
}

interface HttpStub {
  callSigned: jest.Mock
}

async function makeService(
  callSigned: jest.Mock = jest.fn(),
  opts: Partial<typeof baseOptions> & Record<string, unknown> = {},
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PayboxService,
      { provide: PAYBOX_OPTIONS, useValue: { ...baseOptions, ...opts } },
      {
        provide: PayboxHttpService,
        useValue: { callSigned } satisfies HttpStub,
      },
    ],
  }).compile()

  return {
    service: moduleRef.get(PayboxService),
    callSigned,
  }
}

describe('PayboxService', () => {
  describe('verifyWebhook', () => {
    it('returns true when signature matches', async () => {
      const { service } = await makeService()
      const params = {
        pg_payment_id: '999',
        pg_order_id: 'abc',
        pg_result: '1',
      }
      const sig = buildSignature('result', params, baseOptions.secretKey)
      expect(service.verifyWebhook({ ...params, pg_sig: sig })).toBe(true)
    })

    it('returns false when signature is wrong', async () => {
      const { service } = await makeService()
      expect(
        service.verifyWebhook({ pg_order_id: 'x', pg_sig: 'definitely-wrong' }),
      ).toBe(false)
    })

    it('returns false when pg_sig is missing', async () => {
      const { service } = await makeService()
      expect(service.verifyWebhook({ pg_order_id: 'x' })).toBe(false)
    })

    it('uses resultScriptName from options', async () => {
      const { service } = await makeService(jest.fn(), {
        resultScriptName: 'custom',
      })
      const params = { pg_order_id: 'x' }
      const sig = buildSignature('custom', params, baseOptions.secretKey)
      expect(service.verifyWebhook({ ...params, pg_sig: sig })).toBe(true)
    })
  })

  describe('verifyCheckWebhook', () => {
    it('uses check_url script name', async () => {
      const { service } = await makeService()
      const params = { pg_order_id: 'x', pg_amount: '10.00' }
      const sig = buildSignature('check_url', params, baseOptions.secretKey)
      expect(service.verifyCheckWebhook({ ...params, pg_sig: sig })).toBe(true)
    })

    it('returns false when pg_sig is missing', async () => {
      const { service } = await makeService()
      expect(service.verifyCheckWebhook({ pg_order_id: 'x' })).toBe(false)
    })
  })

  describe('initPayment', () => {
    it('converts amount from minor units to major before sending', async () => {
      const callSigned = jest
        .fn()
        .mockResolvedValue(
          '<response><pg_status>ok</pg_status><pg_payment_id>p1</pg_payment_id><pg_redirect_url>https://r</pg_redirect_url></response>',
        )
      const { service } = await makeService(callSigned)
      const result = await service.initPayment({
        orderId: 'o1',
        amount: 150000,
        currency: 'KZT',
        description: 'd',
      })

      expect(result).toEqual({
        providerPaymentId: 'p1',
        redirectUrl: 'https://r',
      })
      const params = callSigned.mock.calls[0][1] as Record<string, string>
      expect(params.pg_amount).toBe('1500')
      expect(params.pg_currency).toBe('KZT')
      expect(params.pg_order_id).toBe('o1')
    })

    it('passes optional user fields when provided', async () => {
      const callSigned = jest
        .fn()
        .mockResolvedValue(
          '<response><pg_status>ok</pg_status><pg_payment_id>p1</pg_payment_id><pg_redirect_url>https://r</pg_redirect_url></response>',
        )
      const { service } = await makeService(callSigned)
      await service.initPayment({
        orderId: 'o1',
        amount: 100,
        currency: 'KZT',
        description: 'd',
        userPhone: '+77001234567',
        userEmail: 'user@example.com',
        userIp: '1.2.3.4',
        userId: 'user-uuid',
      })
      const params = callSigned.mock.calls[0][1] as Record<string, string>
      expect(params.pg_user_phone).toBe('+77001234567')
      expect(params.pg_user_contact_email).toBe('user@example.com')
      expect(params.pg_user_ip).toBe('1.2.3.4')
      expect(params.pg_user_id).toBe('user-uuid')
    })

    it('sets pg_testing_mode flag when testingMode option is true', async () => {
      const callSigned = jest
        .fn()
        .mockResolvedValue(
          '<response><pg_status>ok</pg_status><pg_payment_id>p</pg_payment_id><pg_redirect_url>u</pg_redirect_url></response>',
        )
      const { service } = await makeService(callSigned, { testingMode: true })
      await service.initPayment({
        orderId: 'o',
        amount: 100,
        currency: 'KZT',
        description: 'd',
      })
      const params = callSigned.mock.calls[0][1] as Record<string, string>
      expect(params.pg_testing_mode).toBe('1')
    })

    it('throws when provider returns an error', async () => {
      const callSigned = jest
        .fn()
        .mockResolvedValue(
          '<response><pg_status>error</pg_status><pg_error_description>Bad amount</pg_error_description></response>',
        )
      const { service } = await makeService(callSigned)
      await expect(
        service.initPayment({
          orderId: 'o1',
          amount: 10,
          currency: 'KZT',
          description: 'd',
        }),
      ).rejects.toThrow('Bad amount')
    })
  })

  describe('getPaymentStatus → status mapping', () => {
    const ok = (extra: string) =>
      `<response><pg_status>ok</pg_status>${extra}</response>`

    const cases: Array<[string, string, ProviderPaymentStatus]> = [
      [
        'success',
        '<pg_payment_status>success</pg_payment_status>',
        ProviderPaymentStatus.SUCCESS,
      ],
      [
        'ok alias',
        '<pg_payment_status>ok</pg_payment_status>',
        ProviderPaymentStatus.SUCCESS,
      ],
      [
        'success with refund_amount → refunded',
        '<pg_payment_status>success</pg_payment_status><pg_refund_amount>500</pg_refund_amount>',
        ProviderPaymentStatus.REFUNDED,
      ],
      [
        'failed',
        '<pg_payment_status>failed</pg_payment_status>',
        ProviderPaymentStatus.FAILED,
      ],
      [
        'error alias',
        '<pg_payment_status>error</pg_payment_status>',
        ProviderPaymentStatus.FAILED,
      ],
      [
        'revoked',
        '<pg_payment_status>revoked</pg_payment_status>',
        ProviderPaymentStatus.REFUNDED,
      ],
      [
        'refunded',
        '<pg_payment_status>refunded</pg_payment_status>',
        ProviderPaymentStatus.REFUNDED,
      ],
      [
        'cancelled',
        '<pg_payment_status>cancelled</pg_payment_status>',
        ProviderPaymentStatus.CANCELLED,
      ],
      [
        'canceled (US)',
        '<pg_payment_status>canceled</pg_payment_status>',
        ProviderPaymentStatus.CANCELLED,
      ],
      ['unknown → pending', '', ProviderPaymentStatus.PENDING],
    ]

    test.each(cases)('%s', async (_name, extra, expected) => {
      const callSigned = jest.fn().mockResolvedValue(ok(extra))
      const { service } = await makeService(callSigned)
      const result = await service.getPaymentStatus('p1')
      expect(result.status).toBe(expected)
    })

    it('throws when provider returns non-ok status', async () => {
      const callSigned = jest
        .fn()
        .mockResolvedValue(
          '<r><pg_status>error</pg_status><pg_error_description>not found</pg_error_description></r>',
        )
      const { service } = await makeService(callSigned)
      await expect(service.getPaymentStatus('p1')).rejects.toThrow('not found')
    })

    it('parses captured timestamp only when pg_captured = "1"', async () => {
      const xml = ok(
        '<pg_payment_status>success</pg_payment_status><pg_captured>1</pg_captured><pg_create_date>2026-01-15 12:00:00</pg_create_date>',
      )
      const callSigned = jest.fn().mockResolvedValue(xml)
      const { service } = await makeService(callSigned)
      const result = await service.getPaymentStatus('p1')
      expect(result.capturedAt).toBe('2026-01-15 12:00:00')
    })
  })

  describe('refundPayment', () => {
    it('omits pg_refund_amount for full refund', async () => {
      const callSigned = jest
        .fn()
        .mockResolvedValue('<r><pg_status>ok</pg_status></r>')
      const { service } = await makeService(callSigned)
      await service.refundPayment('pid')
      const params = callSigned.mock.calls[0][1] as Record<string, string>
      expect(params).not.toHaveProperty('pg_refund_amount')
    })

    it('converts partial refund amount from tiyns to major units', async () => {
      const callSigned = jest
        .fn()
        .mockResolvedValue('<r><pg_status>ok</pg_status></r>')
      const { service } = await makeService(callSigned)
      await service.refundPayment('pid', 50000)
      const params = callSigned.mock.calls[0][1] as Record<string, string>
      expect(params.pg_refund_amount).toBe('500')
    })

    it('returns error details when provider rejects refund', async () => {
      const callSigned = jest
        .fn()
        .mockResolvedValue(
          '<r><pg_status>error</pg_status><pg_error_code>100</pg_error_code><pg_error_description>not allowed</pg_error_description></r>',
        )
      const { service } = await makeService(callSigned)
      const result = await service.refundPayment('pid')
      expect(result).toEqual({
        ok: false,
        errorCode: '100',
        errorDescription: 'not allowed',
      })
    })
  })

  describe('cancelPayment', () => {
    it('returns ok on success', async () => {
      const callSigned = jest
        .fn()
        .mockResolvedValue('<r><pg_status>ok</pg_status></r>')
      const { service } = await makeService(callSigned)
      expect(await service.cancelPayment('pid')).toEqual({ ok: true })
    })
  })

  describe('capturePayment', () => {
    it('converts clearingAmount and parses returned amounts', async () => {
      const callSigned = jest
        .fn()
        .mockResolvedValue(
          '<r><pg_status>ok</pg_status><pg_amount>1500</pg_amount><pg_clearing_amount>1500</pg_clearing_amount></r>',
        )
      const { service } = await makeService(callSigned)
      const result = await service.capturePayment('pid', 150000)
      const params = callSigned.mock.calls[0][1] as Record<string, string>
      expect(params.pg_clearing_amount).toBe('1500')
      expect(result).toEqual({ ok: true, amount: 1500, clearingAmount: 1500 })
    })
  })

  describe('buildResponseSignature', () => {
    it('returns signature using script name and configured secret', async () => {
      const { service } = await makeService()
      const sig = service.buildResponseSignature('result', { pg_status: 'ok' })
      expect(sig).toBe(
        buildSignature('result', { pg_status: 'ok' }, baseOptions.secretKey),
      )
    })
  })
})
