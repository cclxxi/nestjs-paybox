import { Inject, Injectable, Logger } from '@nestjs/common'

import { PayboxHttpService } from './http/paybox-http.service'
import {
  CancelResult,
  CaptureResult,
  InitPaymentParams,
  InitPaymentResult,
  PaymentStatusResult,
  ProviderPaymentStatus,
  RefundResult,
} from './interfaces'
import type { PayboxModuleOptions } from './interfaces/paybox-options.interface'
import { PAYBOX_OPTIONS } from './paybox.constants'
import { buildSignature, parseXmlValue } from './utils'

@Injectable()
export class PayboxService {
  private readonly logger = new Logger(PayboxService.name)
  private readonly resultScriptName: string

  constructor(
    @Inject(PAYBOX_OPTIONS) private readonly options: PayboxModuleOptions,
    private readonly httpService: PayboxHttpService,
  ) {
    this.resultScriptName = options.resultScriptName ?? 'result'
  }

  async initPayment(data: InitPaymentParams): Promise<InitPaymentResult> {
    const params: Record<string, string> = {
      pg_merchant_id: this.options.merchantId,
      pg_amount: String(data.amount / 100),
      pg_currency: data.currency,
      pg_order_id: data.orderId,
      pg_description: data.description,
      pg_result_url: this.options.resultUrl,
      pg_success_url: this.options.successUrl,
      pg_failure_url: this.options.failureUrl,
      pg_success_url_method: 'GET',
      pg_failure_url_method: 'GET',
      pg_request_method: 'POST',
      pg_language: 'ru',
    }

    if (this.options.testingMode) {
      params['pg_testing_mode'] = '1'
    }

    if (data.userPhone) params['pg_user_phone'] = data.userPhone
    if (data.userEmail) params['pg_user_contact_email'] = data.userEmail
    if (data.userIp) params['pg_user_ip'] = data.userIp
    if (data.userId) params['pg_user_id'] = data.userId

    this.logger.log(
      `Paybox init_payment: amount=${params.pg_amount} currency=${params.pg_currency} orderId=${params.pg_order_id}`,
    )

    const xml = await this.httpService.callSigned('init_payment.php', params)
    this.logger.debug(`Paybox init_payment response: ${xml}`)

    const status = parseXmlValue(xml, 'pg_status')
    const redirectUrl = parseXmlValue(xml, 'pg_redirect_url')
    const providerPaymentId = parseXmlValue(xml, 'pg_payment_id')

    if (status !== 'ok' || !redirectUrl || !providerPaymentId) {
      const error =
        parseXmlValue(xml, 'pg_error_description') ?? 'Unknown error'
      throw new Error(`Paybox initPayment failed: ${error}`)
    }

    return { providerPaymentId, redirectUrl }
  }

  async getPaymentStatus(
    providerPaymentId: string,
  ): Promise<PaymentStatusResult> {
    const xml = await this.httpService.callSigned('get_status3.php', {
      pg_merchant_id: this.options.merchantId,
      pg_payment_id: providerPaymentId,
    })

    const status = parseXmlValue(xml, 'pg_status')
    if (status !== 'ok') {
      const err = parseXmlValue(xml, 'pg_error_description') ?? 'Unknown error'
      throw new Error(`Paybox getPaymentStatus failed: ${err}`)
    }

    const rawStatus = parseXmlValue(xml, 'pg_payment_status')
    const refundAmount = parseXmlValue(xml, 'pg_refund_amount')
    const canReject = parseXmlValue(xml, 'pg_can_reject')
    const capturedFlag = parseXmlValue(xml, 'pg_captured')
    const createDate = parseXmlValue(xml, 'pg_create_date')

    return {
      providerPaymentId,
      status: this.mapProviderStatus(rawStatus, refundAmount),
      amount: this.toNumber(parseXmlValue(xml, 'pg_amount')),
      currency: parseXmlValue(xml, 'pg_currency'),
      capturedAt: capturedFlag === '1' ? createDate : undefined,
      failureCode: parseXmlValue(xml, 'pg_failure_code'),
      failureDescription: parseXmlValue(xml, 'pg_failure_description'),
      canReject: canReject === '1',
      refundAmount: this.toNumber(refundAmount),
      paymentMethod: parseXmlValue(xml, 'pg_payment_method'),
      cardPan: parseXmlValue(xml, 'pg_card_pan'),
    }
  }

  async cancelPayment(providerPaymentId: string): Promise<CancelResult> {
    const xml = await this.httpService.callSigned('cancel.php', {
      pg_merchant_id: this.options.merchantId,
      pg_payment_id: providerPaymentId,
    })

    const status = parseXmlValue(xml, 'pg_status')
    if (status === 'ok') return { ok: true }
    return {
      ok: false,
      errorCode: parseXmlValue(xml, 'pg_error_code'),
      errorDescription: parseXmlValue(xml, 'pg_error_description'),
    }
  }

  async refundPayment(
    providerPaymentId: string,
    amount?: number,
  ): Promise<RefundResult> {
    const params: Record<string, string> = {
      pg_merchant_id: this.options.merchantId,
      pg_payment_id: providerPaymentId,
    }
    if (amount != null && amount > 0) {
      params['pg_refund_amount'] = String(amount / 100)
    }

    const xml = await this.httpService.callSigned('revoke.php', params)

    const status = parseXmlValue(xml, 'pg_status')
    if (status === 'ok') return { ok: true }
    return {
      ok: false,
      errorCode: parseXmlValue(xml, 'pg_error_code'),
      errorDescription: parseXmlValue(xml, 'pg_error_description'),
    }
  }

  async capturePayment(
    providerPaymentId: string,
    clearingAmount: number,
  ): Promise<CaptureResult> {
    const xml = await this.httpService.callSigned('do_capture.php', {
      pg_merchant_id: this.options.merchantId,
      pg_payment_id: providerPaymentId,
      pg_clearing_amount: String(clearingAmount / 100),
    })

    const status = parseXmlValue(xml, 'pg_status')
    if (status === 'ok') {
      return {
        ok: true,
        amount: this.toNumber(parseXmlValue(xml, 'pg_amount')),
        clearingAmount: this.toNumber(parseXmlValue(xml, 'pg_clearing_amount')),
      }
    }
    return {
      ok: false,
      errorDescription: parseXmlValue(xml, 'pg_error_description'),
    }
  }

  verifyWebhook(params: Record<string, string>): boolean {
    const receivedSig = params['pg_sig']
    if (!receivedSig) {
      this.logger.warn('Webhook missing pg_sig')
      return false
    }

    const paramsWithoutSig = { ...params }
    delete paramsWithoutSig['pg_sig']

    const expectedSig = buildSignature(
      this.resultScriptName,
      paramsWithoutSig,
      this.options.secretKey,
    )
    const isValid = expectedSig === receivedSig

    if (!isValid) {
      this.logger.warn(
        `Invalid webhook signature. Expected ${expectedSig}, got ${receivedSig} (script_name=${this.resultScriptName})`,
      )
    }
    return isValid
  }

  verifyCheckWebhook(params: Record<string, string>): boolean {
    const receivedSig = params['pg_sig']
    if (!receivedSig) return false

    const paramsWithoutSig = { ...params }
    delete paramsWithoutSig['pg_sig']

    return (
      buildSignature('check_url', paramsWithoutSig, this.options.secretKey) ===
      receivedSig
    )
  }

  buildResponseSignature(
    scriptName: string,
    params: Record<string, string>,
  ): string {
    return buildSignature(scriptName, params, this.options.secretKey)
  }

  private mapProviderStatus(
    raw: string | undefined,
    refundAmount: string | undefined,
  ): ProviderPaymentStatus {
    switch (raw) {
      case 'success':
      case 'ok':
        return refundAmount && Number(refundAmount) !== 0
          ? ProviderPaymentStatus.REFUNDED
          : ProviderPaymentStatus.SUCCESS
      case 'failed':
      case 'error':
        return ProviderPaymentStatus.FAILED
      case 'revoked':
      case 'refunded':
        return ProviderPaymentStatus.REFUNDED
      case 'cancelled':
      case 'canceled':
        return ProviderPaymentStatus.CANCELLED
      default:
        return ProviderPaymentStatus.PENDING
    }
  }

  private toNumber(value: string | undefined): number | undefined {
    if (value == null) return undefined
    const n = Number(value)
    return Number.isNaN(n) ? undefined : n
  }
}
