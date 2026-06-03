# nestjs-paybox

[English](./README.md) · **Русский**

[![npm version](https://img.shields.io/npm/v/nestjs-paybox.svg)](https://www.npmjs.com/package/nestjs-paybox)
[![npm downloads](https://img.shields.io/npm/dm/nestjs-paybox.svg)](https://www.npmjs.com/package/nestjs-paybox)
[![License: LGPL v3](https://img.shields.io/badge/License-LGPLv3-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-9%20|%2010%20|%2011-e0234e.svg)](https://nestjs.com)

Небольшой, «всё включено» модуль для NestJS под **протокол Paybox** —
GreenleavesPay, Paybox.money и другие совместимые провайдеры. Подключаешь один раз
и получаешь типизированный `PayboxService` плюс гард `@PayboxWebhook()`, который
сам проверяет колбэки.

Никакого тяжёлого SDK и отдельного HTTP-клиента — только нативный `fetch`,
подпись запросов через MD5 и тонкая типизированная обёртка над XML-API провайдера.

## Почему nestjs-paybox

- **Типизировано насквозь** — платежи, возвраты, клиринг, статусы и payload вебхуков
  приходят нормальными типами TypeScript, а не сырыми `Record`.
- **Безопасно по умолчанию** — подпись вебхука сверяется **за константное время**,
  поля с картой и PII вырезаются из логов, а конфиг проверяется на старте, так что
  пропущенный секрет упадёт сразу, а не сломает подписи молча.
- **Авторизация вебхука в одну строку** — `@PayboxWebhook()` берёт на себя проверку
  IP-allowlist и `pg_sig`; в хендлер попадают только проверенные запросы.
- **Без лишних обрядов** — `forRoot` / `forRootAsync`, разумные значения по
  умолчанию, минимум зависимостей (в peer только `@nestjs/common` и
  `reflect-metadata`).

## Установка

```bash
npm install nestjs-paybox
# или
yarn add nestjs-paybox
# или
pnpm add nestjs-paybox
```

Нужен Node.js 18+ (используется нативный `fetch`).

## Быстрый старт

### 1. Зарегистрируй модуль

**Статическая конфигурация:**

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

**Асинхронная конфигурация (рекомендуется):**

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

> Обязательные опции (`merchantId`, `secretKey` и три URL) проверяются при инициализации
> модуля — пустое или отсутствующее значение бросит ошибку на старте, а не на первом запросе.

### 2. Используй `PayboxService`

```typescript
import { Injectable } from '@nestjs/common'
import { PayboxService } from 'nestjs-paybox'

@Injectable()
export class OrderService {
  constructor(private readonly paybox: PayboxService) {}

  async createPayment(orderId: string, amount: number) {
    const { providerPaymentId, redirectUrl } = await this.paybox.initPayment({
      orderId,
      amount,       // в минорных единицах (тиынах): 150000 = 1500 KZT
      currency: 'KZT',
      description: 'Оплата заказа',
      userEmail: 'user@example.com',
    })

    return { providerPaymentId, redirectUrl }
  }
}
```

### 3. Обрабатывай вебхуки

```typescript
import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common'
import { Response } from 'express'
import { PayboxWebhook, PayboxWebhookPayload, PayboxService } from 'nestjs-paybox'

@Controller('webhook')
export class WebhookController {
  constructor(private readonly paybox: PayboxService) {}

  @Post('paybox/result')
  @HttpCode(200)
  @PayboxWebhook()  // проверяет IP-allowlist + подпись pg_sig
  async handleResult(@Body() body: Record<string, string>, @Res() res: Response) {
    const orderId = body['pg_order_id']
    const isSuccess = body['pg_result'] === '1'

    // твоя бизнес-логика здесь

    const xml = this.paybox.buildResponseSignature('result', {
      pg_status: 'ok',
      pg_description: 'Order processed',
    })
    return res.set('Content-Type', 'text/xml').send(xml)
  }
}
```

## Опции модуля

| Опция | Тип | Обязательна | Описание |
|--------|------|----------|-------------|
| `merchantId` | `string` | ✓ | ID мерчанта |
| `secretKey` | `string` | ✓ | Секретный ключ для подписи запросов |
| `resultUrl` | `string` | ✓ | URL, куда провайдер шлёт колбэки-вебхуки |
| `successUrl` | `string` | ✓ | Redirect при успешной оплате |
| `failureUrl` | `string` | ✓ | Redirect при неудачной оплате |
| `apiUrl` | `string` | | Базовый URL API провайдера. По умолчанию: `https://api.greenleavespay.kz` |
| `testingMode` | `boolean` | | Включить флаг тестового режима в запросах |
| `resultScriptName` | `string` | | Имя скрипта для проверки подписи вебхука. По умолчанию: `'result'` |
| `allowedIps` | `string[]` | | IP-allowlist для гарда `@PayboxWebhook()`. Пусто = пропустить проверку IP (подпись всё равно сверяется) |
| `timeoutMs` | `number` | | Таймаут HTTP-запроса в мс. По умолчанию: `30000` |
| `isGlobal` | `boolean` | | Регистрировать модуль глобально. По умолчанию: `true` |

## API `PayboxService`

### `initPayment(params)`

Создаёт платёжную сессию и возвращает URL для редиректа.

```typescript
const result = await paybox.initPayment({
  orderId: 'order-uuid',
  amount: 150000,          // 1500 KZT в тиынах
  currency: 'KZT',
  description: 'Оплата заказа #42',
  userPhone: '+77001234567',    // опционально
  userEmail: 'user@example.com', // опционально
  userIp: '1.2.3.4',           // опционально
  userId: 'user-uuid',          // опционально
})

// result: { providerPaymentId: string, redirectUrl: string }
```

### `getPaymentStatus(providerPaymentId)`

Запрашивает текущий статус платежа у провайдера. Полезно, если вебхук был пропущен.

```typescript
const status = await paybox.getPaymentStatus('grl-payment-id')

// result: {
//   providerPaymentId, status, amount, currency,
//   capturedAt, failureCode, failureDescription,
//   canReject, refundAmount, paymentMethod, cardPan
// }
```

### `cancelPayment(providerPaymentId)`

Отменяет платёж в статусе ожидания.

```typescript
const result = await paybox.cancelPayment('grl-payment-id')
// result: { ok: boolean, errorCode?, errorDescription? }
```

### `refundPayment(providerPaymentId, amount?)`

Возврат платежа. `amount` — в минорных единицах (тиынах). Без него — полный возврат.

```typescript
const result = await paybox.refundPayment('grl-payment-id', 50000) // частично: 500 KZT
const result = await paybox.refundPayment('grl-payment-id')        // полный возврат
// result: { ok: boolean, errorCode?, errorDescription? }
```

### `capturePayment(providerPaymentId, clearingAmount)`

Клиринг авторизованного платежа (двухстадийная авторизация). `clearingAmount` — в минорных единицах.

```typescript
const result = await paybox.capturePayment('grl-payment-id', 150000)
// result: { ok: boolean, amount?, clearingAmount?, errorDescription? }
```

### `verifyWebhook(params)` / `verifyCheckWebhook(params)`

Ручная проверка подписи вебхука (сравнение за константное время). Вызывается автоматически гардом `@PayboxWebhook()`.

```typescript
const isValid = paybox.verifyWebhook(req.body)
const isValid = paybox.verifyCheckWebhook(req.body) // для колбэков check_url
```

### `buildResponseSignature(scriptName, params)`

Собирает подписанный XML-ответ провайдеру после обработки вебхука.

```typescript
const xml = paybox.buildResponseSignature('result', {
  pg_status: 'ok',
  pg_description: 'Order processed',
})
```

## Декоратор `@PayboxWebhook()`

Навешивает на метод контроллера гард с проверкой IP-allowlist и подписи `pg_sig`. Бросает:

- `ForbiddenException` — IP запроса не входит в `allowedIps`
- `UnauthorizedException` — `pg_sig` отсутствует или неверна

```typescript
@Post('paybox/result')
@PayboxWebhook()
async handleResult(@Body() body: Record<string, string>) { ... }
```

Если `allowedIps` пуст или не задан, проверка IP пропускается — но подпись проверяется **всегда**.

> Декоратор покрывает скрипт `result` (настраивается через `resultScriptName`). Для колбэков `check_url` вызывай `paybox.verifyCheckWebhook(body)` вручную.

## О безопасности

- **Подпись за константное время.** `pg_sig` сверяется через
  `crypto.timingSafeEqual`, поэтому проверка не утекает по времени информацию об
  ожидаемом значении.
- **Редакция логов.** Сырой XML провайдера логируется только на уровне `debug`, а
  поля с картой и PII (`pg_card_pan`, `pg_card_hash`, `pg_user_phone`,
  `pg_user_contact_email`) маскируются перед записью.
- **IP-allowlist и прокси.** За балансировщиком гард берёт IP клиента из `req.ip`
  (учитывает Express `trust proxy`), с откатом на `x-forwarded-for`. Этот заголовок
  клиент может подделать, если он не обрезается на доверенном прокси — настрой
  `trust proxy` и перезаписывай `x-forwarded-for` на своём периметре, прежде чем
  полагаться на `allowedIps` как на защиту.

## Типы

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

**Enum `ProviderPaymentStatus`:**

```typescript
enum ProviderPaymentStatus {
  PENDING   = 'pending',
  SUCCESS   = 'success',
  FAILED    = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED  = 'refunded',
}
```

## Пример переменных окружения

```env
PAYBOX_MERCHANT_ID=123456
PAYBOX_SECRET_KEY=your_secret_key
PAYBOX_RESULT_URL=https://api.yourapp.com/webhook/paybox/result
PAYBOX_SUCCESS_URL=https://yourapp.com/checkout/success
PAYBOX_FAILURE_URL=https://yourapp.com/checkout/failure
PAYBOX_CALLBACK_IPS=13.60.106.42
```

## Работа с суммами

Все суммы — в **минорных единицах** (тиыны для KZT: 1 KZT = 100 тиынов). Библиотека
автоматически конвертирует их в мажорные единицы перед вызовом API провайдера.

```typescript
// 1500 KZT → передай 150000
await paybox.initPayment({ amount: 150000, currency: 'KZT', ... })
```

## Контрибьют

Буду рад любым правкам — баг-репортам, документации или коду. В
[CONTRIBUTING.md](./CONTRIBUTING.md) описано, как поднять окружение, прогнать
проверки и прислать PR. Задачи, с которых удобно начать, помечены лейблом
[`good first issue`](https://github.com/cclxxi/nestjs-paybox/labels/good%20first%20issue).

## Лицензия

GNU Lesser General Public License v3.0 или новее (LGPL-3.0-or-later).
Полный текст — в [`LICENSE`](./LICENSE) и [`COPYING`](./COPYING).

© 2026 Ilia Proshin.

Версии `0.1.3` и ранее выходили под лицензией MIT. Релиз `0.1.6` недолго был
опубликован под GPL-3.0. Начиная с `0.1.7` пакет распространяется под
LGPL-3.0-or-later — код приложения, которое просто импортирует библиотеку, **не**
обязан открывать исходники; изменения самой библиотеки должны оставаться под
совместимой лицензией.
