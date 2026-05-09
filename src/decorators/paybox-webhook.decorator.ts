import { applyDecorators, UseGuards } from '@nestjs/common'

import { PayboxWebhookGuard } from '../guards'

export function PayboxWebhook(): MethodDecorator {
  return applyDecorators(UseGuards(PayboxWebhookGuard))
}
