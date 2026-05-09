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
  useFactory: (
    ...args: any[]
  ) => Promise<PayboxModuleOptions> | PayboxModuleOptions
  inject?: any[]
  /** Register module as global. Default: true. */
  isGlobal?: boolean
}
