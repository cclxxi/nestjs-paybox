import { ModuleMetadata } from '@nestjs/common'

export interface PayboxModuleOptions {
  merchantId: string
  secretKey: string
  resultUrl: string
  successUrl: string
  failureUrl: string
  apiUrl?: string
  testingMode?: boolean
  resultScriptName?: string
  /**
   * IP allowlist for incoming webhooks. NOTE: when behind a proxy/load balancer
   * the guard reads the client IP from `x-forwarded-for`, which clients can
   * spoof unless the header is set by a trusted proxy. Terminate/overwrite
   * `x-forwarded-for` at your edge (and configure Express `trust proxy`) before
   * relying on this list as a security boundary.
   */
  allowedIps?: string[]
  /** HTTP request timeout in milliseconds. Default: 30000. */
  timeoutMs?: number
  /** Register module as global (PayboxService available everywhere without re-importing). Default: true. */
  isGlobal?: boolean
}

export interface PayboxModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  // `any[]` mirrors NestJS's own async-options idiom: factory args are DI
  // tokens of arbitrary type, so a stricter signature would reject valid
  // user factories like `(config: ConfigService) => options`.

  useFactory: (
    ...args: any[]
  ) => Promise<PayboxModuleOptions> | PayboxModuleOptions

  inject?: any[]
  /** Register module as global. Default: true. */
  isGlobal?: boolean
}
