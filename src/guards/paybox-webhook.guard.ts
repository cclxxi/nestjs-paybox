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
import { PayboxService } from '../paybox.service'

@Injectable()
export class PayboxWebhookGuard implements CanActivate {
  private readonly logger = new Logger(PayboxWebhookGuard.name)

  constructor(
    @Inject(PAYBOX_OPTIONS) private readonly options: PayboxModuleOptions,
    private readonly payboxService: PayboxService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()

    this.assertAllowedIp(req)

    const body = req.body as Record<string, string> | undefined
    if (!body || typeof body !== 'object') {
      throw new UnauthorizedException('Invalid webhook body')
    }

    // Single source of truth for signature verification (constant-time compare).
    if (!this.payboxService.verifyWebhook(body)) {
      throw new UnauthorizedException('Invalid signature')
    }

    return true
  }

  private assertAllowedIp(req: Request): void {
    const allowedIps = this.options.allowedIps ?? []
    if (allowedIps.length === 0) return

    // Prefer Express-resolved req.ip (honors `trust proxy`). x-forwarded-for is
    // only consulted as a fallback and is client-spoofable unless terminated at
    // a trusted proxy — see PayboxModuleOptions.allowedIps docs.
    const ip =
      req.ip ??
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ??
      req.socket?.remoteAddress ??
      ''

    if (!allowedIps.includes(ip)) {
      this.logger.warn(`Rejected webhook from unauthorized IP: ${ip}`)
      throw new ForbiddenException('Unauthorized IP')
    }
  }
}
