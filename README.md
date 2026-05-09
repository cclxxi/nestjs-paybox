# nestjs-paybox

NestJS module for integrating with payment providers that use the **Paybox protocol** (GreenleavesPay, Paybox.money, and compatible providers).

## Installation

```bash
npm install nestjs-paybox
# or
yarn add nestjs-paybox
# or
pnpm add nestjs-paybox
```

Requires Node.js 18+ (uses native `fetch`).

## Quick start

### 1. Register the module

**Static configuration:**

```typescript
import { PayboxModule } from 'nestjs-paybox'

@Module({
  imports: [
    PayboxModule.forRoot({
      merchantId: '123456',
      secretKey: 'your_secret_key',
      resultUrl: 'https://api.yourapp.com/webhook/paybox/result',
      successUrl: 'https://yourapp.com/checkout/success',
      failureUrl: 'https://yourapp.com/checkout/failure',
    }),
  ],
})
export class AppModule {}
```

**Async configuration (recommended):**

```typescript
import { PayboxModule } from 'nestjs-paybox'
import { ConfigModule, ConfigService } from '@nestjs/config'

@Module({
  imports: [
    PayboxModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        merchantId: config.getOrThrow('PAYBOX_MERCHANT_ID'),
        secretKey: config.getOrThrow('PAYBOX_SECRET_KEY'),
        resultUrl: config.getOrThrow('PAYBOX_RESULT_URL'),
        successUrl: config.getOrThrow('PAYBOX_SUCCESS_URL'),
        failureUrl: config.getOrThrow('PAYBOX_FAILURE_URL'),
        allowedIps: config.get('PAYBOX_CALLBACK_IPS', '').split(',').filter(Boolean),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### 2. Use `PayboxService`

```typescript
import { Injectable } from '@nestjs/common'
import { PayboxService } from 'nestjs-paybox'

@Injectable()
export class OrderService {
  constructor(private readonly paybox: PayboxService) {}

  async createPayment(orderId: string, amount: number) {
    const { providerPaymentId, redirectUrl } = await this.paybox.initPayment({
      orderId,
      amount,       // in minor units (tiyns): 150000 = 1500 KZT
      currency: 'KZT',
      description: 'Order payment',
      userEmail: 'user@example.com',
    })

    return { providerPaymentId, redirectUrl }
  }
}
```

### 3. Handle webhooks

```typescript
import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common'
import { Response } from 'express'
import { PayboxWebhook, PayboxWebhookPayload, PayboxService } from 'nestjs-paybox'

@Controller('webhook')
export class WebhookController {
  constructor(private readonly paybox: PayboxService) {}

  @Post('paybox/result')
  @HttpCode(200)
  @PayboxWebhook()  // verifies IP whitelist + pg_sig signature
  async handleResult(@Body() body: Record<string, string>, @Res() res: Response) {
    const orderId = body['pg_order_id']
    const isSuccess = body['pg_result'] === '1'

    // your business logic here

    const xml = this.paybox.buildResponseSignature('result', {
      pg_status: 'ok',
      pg_description: 'Order processed',
    })
    return res.set('Content-Type', 'text/xml').send(xml)
  }
}
```

## Module options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `merchantId` | `string` | ✓ | Your merchant ID |
| `secretKey` | `string` | ✓ | Secret key for signing requests |
| `resultUrl` | `string` | ✓ | URL where the provider sends webhook callbacks |
| `successUrl` | `string` | ✓ | Redirect URL on successful payment |
| `failureUrl` | `string` | ✓ | Redirect URL on failed payment |
| `apiUrl` | `string` | | Provider API base URL. Default: `https://api.greenleavespay.kz` |
| `testingMode` | `boolean` | | Enable testing mode flag in requests |
| `resultScriptName` | `string` | | Script name for webhook signature verification. Default: `'result'` |
| `allowedIps` | `string[]` | | IP whitelist for `@PayboxWebhook()` guard. Empty = skip IP check (signature is still verified) |
| `timeoutMs` | `number` | | HTTP request timeout in ms. Default: `30000` |
| `isGlobal` | `boolean` | | Register module as global. Default: `true` |

## PayboxService API

### `initPayment(params)`

Creates a payment session and returns a redirect URL.

```typescript
const result = await paybox.initPayment({
  orderId: 'order-uuid',
  amount: 150000,          // 1500 KZT in tiyns
  currency: 'KZT',
  description: 'Payment for order #42',
  userPhone: '+77001234567',    // optional
  userEmail: 'user@example.com', // optional
  userIp: '1.2.3.4',           // optional
  userId: 'user-uuid',          // optional
})

// result: { providerPaymentId: string, redirectUrl: string }
```

### `getPaymentStatus(providerPaymentId)`

Fetches the current payment status from the provider. Useful when a webhook was missed.

```typescript
const status = await paybox.getPaymentStatus('grl-payment-id')

// result: {
//   providerPaymentId, status, amount, currency,
//   capturedAt, failureCode, failureDescription,
//   canReject, refundAmount, paymentMethod, cardPan
// }
```

### `cancelPayment(providerPaymentId)`

Cancels a pending payment.

```typescript
const result = await paybox.cancelPayment('grl-payment-id')
// result: { ok: boolean, errorCode?, errorDescription? }
```

### `refundPayment(providerPaymentId, amount?)`

Refunds a payment. `amount` is in minor units (tiyns). Omit for a full refund.

```typescript
const result = await paybox.refundPayment('grl-payment-id', 50000) // partial: 500 KZT
const result = await paybox.refundPayment('grl-payment-id')        // full refund
// result: { ok: boolean, errorCode?, errorDescription? }
```

### `capturePayment(providerPaymentId, clearingAmount)`

Captures an authorized payment (two-phase authorization). `clearingAmount` is in minor units.

```typescript
const result = await paybox.capturePayment('grl-payment-id', 150000)
// result: { ok: boolean, amount?, clearingAmount?, errorDescription? }
```

### `verifyWebhook(params)` / `verifyCheckWebhook(params)`

Manually verify a webhook signature. Called automatically by `@PayboxWebhook()` guard.

```typescript
const isValid = paybox.verifyWebhook(req.body)
const isValid = paybox.verifyCheckWebhook(req.body) // for check_url callbacks
```

### `buildResponseSignature(scriptName, params)`

Build a signed XML response to send back to the provider after processing a webhook.

```typescript
const xml = paybox.buildResponseSignature('result', {
  pg_status: 'ok',
  pg_description: 'Order processed',
})
```

## `@PayboxWebhook()` decorator

Applies an IP whitelist check and `pg_sig` signature verification guard to a controller method. Throws:

- `ForbiddenException` — request IP not in `allowedIps`
- `UnauthorizedException` — missing/invalid `pg_sig`

```typescript
@Post('paybox/result')
@PayboxWebhook()
async handleResult(@Body() body: Record<string, string>) { ... }
```

If `allowedIps` is empty or not set, the IP check is skipped — but the signature check is **always** performed.

> The decorator covers the `result` script (configurable via `resultScriptName`). For `check_url` callbacks, call `paybox.verifyCheckWebhook(body)` manually.

## Types

```typescript
import {
  InitPaymentParams,
  InitPaymentResult,
  PaymentStatusResult,
  ProviderPaymentStatus,
  CancelResult,
  RefundResult,
  CaptureResult,
  PayboxWebhookPayload,
  PayboxModuleOptions,
} from 'nestjs-paybox'
```

**`ProviderPaymentStatus` enum:**

```typescript
enum ProviderPaymentStatus {
  PENDING   = 'pending',
  SUCCESS   = 'success',
  FAILED    = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED  = 'refunded',
}
```

## Environment variables example

```env
PAYBOX_MERCHANT_ID=123456
PAYBOX_SECRET_KEY=your_secret_key
PAYBOX_RESULT_URL=https://api.yourapp.com/webhook/paybox/result
PAYBOX_SUCCESS_URL=https://yourapp.com/checkout/success
PAYBOX_FAILURE_URL=https://yourapp.com/checkout/failure
PAYBOX_CALLBACK_IPS=13.60.106.42
```

## Amount handling

All amounts are in **minor units** (tiyns for KZT: 1 KZT = 100 tiyns). The library automatically converts to major units when calling the provider API.

```typescript
// 1500 KZT → pass 150000
await paybox.initPayment({ amount: 150000, currency: 'KZT', ... })
```

## License

MIT
