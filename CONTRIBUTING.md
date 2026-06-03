# Contributing to nestjs-paybox

Thanks for your interest in improving nestjs-paybox! This is a small, focused
library, so contributions of any size — bug reports, docs, or code — are very
welcome.

## Development setup

You need Node.js 18+ and [pnpm](https://pnpm.io/) (the repo is pinned via
`packageManager`).

```sh
git clone https://github.com/cclxxi/nestjs-paybox
cd nestjs-paybox
pnpm install
pnpm test        # run the unit tests
pnpm build       # type-check and emit dist/
```

There's no live provider in tests — everything is unit-tested against mocked HTTP
and crafted XML/signatures, so you can develop fully offline.

## Before opening a pull request

Please make sure all of these pass:

```sh
pnpm lint          # eslint (auto-fixes what it can)
pnpm format        # prettier --write
pnpm test          # unit tests
pnpm build         # tsc / nest build must succeed
```

A few more asks:

- Keep changes focused; one logical change per PR.
- Add or update tests for behavior you change — aim to keep coverage high
  (`pnpm test:cov`).
- Don't break the public API of `nestjs-paybox` (the exports from `src/index.ts`)
  without a clear reason; note it in the PR if you do.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages (e.g. `feat: add @PayboxCheckWebhook decorator`).

## Coding guidelines

- Prefer many small, focused files over large ones; organize by feature.
- Keep functions small and handle errors explicitly — never silently swallow them.
- Treat all webhook/provider input as untrusted: validate at the boundary.
- **Security-sensitive code** (signatures, the webhook guard, logging) deserves
  extra care: signatures are compared in constant time, and card/PII fields must
  never reach logs. If you touch `signature.util.ts`, the guard, or any logging,
  call it out in the PR.
- Controllers/guards stay thin; business logic lives in services.

## Architecture overview

- `src/paybox.module.ts` — dynamic module (`forRoot` / `forRootAsync`) with boot-time
  options validation
- `src/paybox.service.ts` — main API: init / status / cancel / refund / capture, plus
  webhook signature verification
- `src/http/paybox-http.service.ts` — signed `fetch` to the provider (salt + `pg_sig`),
  timeout handling, redacted response logging
- `src/guards/paybox-webhook.guard.ts` — IP allowlist + `pg_sig` guard (delegates to
  `PayboxService.verifyWebhook`)
- `src/decorators/paybox-webhook.decorator.ts` — the `@PayboxWebhook()` decorator
- `src/utils/` — signing (MD5 + constant-time compare), XML parse/redact, options
  validation
- `src/interfaces/` — typed options, payment results, and webhook payloads

## Ideas / good first issues

- A `@PayboxCheckWebhook()` decorator mirroring `@PayboxWebhook()` for `check_url`
  callbacks.
- Make `pg_language` configurable instead of hard-coded `'ru'`.
- Support `useClass` / `useExisting` in `forRootAsync` (not just `useFactory`).
- Optional retry-with-backoff on network errors / 5xx in `PayboxHttpService`.
- A helper that builds the full signed XML response body (status + `pg_sig`) in one
  call, instead of just the signature.
- An end-to-end test that spins up a mock provider HTTP server and exercises the
  webhook guard via supertest.

Want to pick one up? Open an issue (or comment on an existing one) so we don't
duplicate work.

## License

By contributing, you agree that your contributions will be licensed under the
project's [LGPL-3.0-or-later](./LICENSE) license.
