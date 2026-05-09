import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'

import type { PayboxModuleOptions } from '../interfaces'
import { PAYBOX_OPTIONS } from '../paybox.constants'
import { buildSignature } from '../utils'

@Injectable()
export class PayboxWebhookGuard implements CanActivate {
  private readonly logger = new Logger(PayboxWebhookGuard.name)

  constructor(
    @Inject(PAYBOX_OPTIONS) private readonly options: PayboxModuleOptions,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()

    const allowedIps = this.options.allowedIps ?? []
    if (allowedIps.length > 0) {
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        req.ip ??
        req.socket.remoteAddress ??
        ''

      if (!allowedIps.includes(ip)) {
        this.logger.warn(`Rejected webhook from unauthorized IP: ${ip}`)
        throw new ForbiddenException('Unauthorized IP')
      }
    }

    const body = req.body as Record<string, string> | undefined
    if (!body || typeof body !== 'object') {
      throw new UnauthorizedException('Invalid webhook body')
    }

    const receivedSig = body['pg_sig']
    if (!receivedSig) {
      this.logger.warn('Webhook missing pg_sig')
      throw new UnauthorizedException('Missing pg_sig')
    }

    const scriptName = this.options.resultScriptName ?? 'result'
    const paramsWithoutSig = { ...body }
    delete paramsWithoutSig['pg_sig']

    const expected = buildSignature(
      scriptName,
      paramsWithoutSig,
      this.options.secretKey,
    )
    if (expected !== receivedSig) {
      this.logger.warn(
        `Invalid webhook signature (script_name=${scriptName}, expected=${expected}, got=${receivedSig})`,
      )
      throw new UnauthorizedException('Invalid signature')
    }

    return true
  }
}
