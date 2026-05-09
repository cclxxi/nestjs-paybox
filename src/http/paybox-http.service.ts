import { Inject, Injectable, Logger } from '@nestjs/common'
import crypto from 'node:crypto'

import type { PayboxModuleOptions } from '../interfaces'
import { PAYBOX_API_URL, PAYBOX_OPTIONS } from '../paybox.constants'
import { buildSignature } from '../utils'

const DEFAULT_TIMEOUT_MS = 30_000

@Injectable()
export class PayboxHttpService {
  private readonly logger = new Logger(PayboxHttpService.name)

  constructor(
    @Inject(PAYBOX_OPTIONS) private readonly options: PayboxModuleOptions,
  ) {}

  async callSigned(
    scriptName: string,
    params: Record<string, string>,
  ): Promise<string> {
    const fullParams: Record<string, string> = {
      ...params,
      pg_salt: crypto.randomBytes(8).toString('hex'),
    }
    fullParams['pg_sig'] = buildSignature(
      scriptName,
      fullParams,
      this.options.secretKey,
    )

    const body = new URLSearchParams(fullParams).toString()
    const baseUrl = this.options.apiUrl ?? PAYBOX_API_URL
    const url = `${baseUrl}/${scriptName}`

    const controller = new AbortController()
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(
          `Paybox HTTP ${response.status} on ${scriptName}${text ? `: ${text.slice(0, 200)}` : ''}`,
        )
      }

      const xml = await response.text()
      this.logger.debug(`Paybox ${scriptName} response: ${xml}`)
      return xml
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `Paybox request timed out after ${timeoutMs}ms (${scriptName})`,
        )
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}
