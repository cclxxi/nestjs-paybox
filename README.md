# nestjs-paybox

**English** · [Русский](./README.ru.md)

[![npm version](https://img.shields.io/npm/v/nestjs-paybox.svg)](https://www.npmjs.com/package/nestjs-paybox)
[![npm downloads](https://img.shields.io/npm/dm/nestjs-paybox.svg)](https://www.npmjs.com/package/nestjs-paybox)
[![License: LGPL v3](https://img.shields.io/badge/License-LGPLv3-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-9%20|%2010%20|%2011-e0234e.svg)](https://nestjs.com)

A small, batteries-included NestJS module for the **Paybox payment protocol** —
GreenleavesPay, Paybox.money, and other compatible providers. Drop it in, register
once, and you get a typed `PayboxService` plus a `@PayboxWebhook()` guard that
verifies callbacks for you.

No heavyweight SDK, no extra HTTP client — just native `fetch`, MD5 request
signing, and a thin typed surface over the provider's XML API.

## Why nestjs-paybox

- **Typed end to end** — payments, refunds, captures, status, and webhook payloads
  all come back as proper TypeScript types, not loose `Record`s.
- **Secure by default** — webhook signatures are checked in **constant time**,
  card/PII fields are redacted from logs, and config is validated at boot so a
  missing secret fails fast instead of silently breaking signatures.
- **One-line webhook auth** — `@PayboxWebhook()` handles the IP allowlist and
  `pg_sig` verification; your handler only sees verified requests.
- **Zero ceremony** — `forRoot` / `forRootAsync`, sensible defaults, ~1 dependency
  surface (just `@nestjs/common` + `reflect-metadata` as peers).

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

> Required options (`merchantId`, `secretKey`, and the three URLs) are validated at
> module init — a missing or blank value throws on boot, not at the first request.

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
  @PayboxWebhook()  // verifies IP allowlist + pg_sig signature
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
| `allowedIps` | `string[]` | | IP allowlist for `@PayboxWebhook()` guard. Empty = skip IP check (signature is still verified) |
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

Manually verify a webhook signature (constant-time comparison). Called automatically by the `@PayboxWebhook()` guard.

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

Applies an IP allowlist check and `pg_sig` signature verification guard to a controller method. Throws:

- `ForbiddenException` — request IP not in `allowedIps`
- `UnauthorizedException` — missing/invalid `pg_sig`

```typescript
@Post('paybox/result')
@PayboxWebhook()
async handleResult(@Body() body: Record<string, string>) { ... }
```

If `allowedIps` is empty or not set, the IP check is skipped — but the signature check is **always** performed.

> The decorator covers the `result` script (configurable via `resultScriptName`). For `check_url` callbacks, call `paybox.verifyCheckWebhook(body)` manually.

## Security notes

- **Constant-time signatures.** Webhook `pg_sig` is compared with
  `crypto.timingSafeEqual`, so signature verification doesn't leak timing
  information about the expected value.
- **Log redaction.** Raw provider XML is only logged at `debug`, and card/PII
  fields (`pg_card_pan`, `pg_card_hash`, `pg_user_phone`, `pg_user_contact_email`)
  are masked before logging.
- **IP allowlist & proxies.** When behind a load balancer the guard reads the
  client IP from `req.ip` (which honors Express `trust proxy`), falling back to
  `x-forwarded-for`. That header is client-spoofable unless terminated at a
  trusted proxy — set `trust proxy` and overwrite `x-forwarded-for` at your edge
  before relying on `allowedIps` as a security boundary.

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

All amounts are in **minor units** (tiyns for KZT: 1 KZT = 100 tiyns). The library
automatically converts to major units when calling the provider API.

```typescript
// 1500 KZT → pass 150000
await paybox.initPayment({ amount: 150000, currency: 'KZT', ... })
```

## Contributing

Contributions of any size are welcome — bug reports, docs, or code. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for how to set up, run the checks, and open a
pull request. Issues that are a good place to start are labeled
[`good first issue`](https://github.com/cclxxi/nestjs-paybox/labels/good%20first%20issue).

## License

GNU Lesser General Public License v3.0 or later (LGPL-3.0-or-later).
See [`LICENSE`](./LICENSE) and [`COPYING`](./COPYING) for the full text.

Copyright © 2026 Ilia Proshin.

Versions `0.1.3` and earlier were released under the MIT license. The `0.1.6`
release was briefly published under GPL-3.0. From `0.1.7` onward the package is
licensed under LGPL-3.0-or-later — application code that merely imports this
library is **not** required to be open-sourced; modifications to the library
itself must remain under a compatible license.
