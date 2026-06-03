---
name: Bug report
about: Report something that isn't working as expected
title: "[bug] "
labels: bug
---

## Description

A clear description of the bug.

## Steps to reproduce

1. Register `PayboxModule` with `...`
2. Call `paybox.initPayment(...)` / receive a webhook / ...
3. See the problem

A minimal code snippet (module config + the call) helps a lot.

## Expected behavior

What you expected to happen.

## Actual behavior

What actually happened. Include the thrown error and stack trace if any —
**redact `secretKey`, `pg_sig`, card numbers, and other sensitive values.**

## Environment

- nestjs-paybox version:
- @nestjs/common version:
- Node.js version: `node --version`
- Provider (GreenleavesPay / Paybox.money / other):

## Additional context

Anything else that helps — sanitized request/response XML, config, etc.
