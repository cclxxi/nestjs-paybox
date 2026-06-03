import { DynamicModule, Module } from '@nestjs/common'

import { PayboxHttpService } from './http/paybox-http.service'
import { PayboxModuleAsyncOptions, PayboxModuleOptions } from './interfaces'
import { PAYBOX_OPTIONS } from './paybox.constants'
import { PayboxService } from './paybox.service'
import { validatePayboxOptions } from './utils'

@Module({})
export class PayboxModule {
  static forRoot(options: PayboxModuleOptions): DynamicModule {
    return {
      module: PayboxModule,
      global: options.isGlobal ?? true,
      providers: [
        { provide: PAYBOX_OPTIONS, useValue: validatePayboxOptions(options) },
        PayboxHttpService,
        PayboxService,
      ],
      exports: [PayboxService],
    }
  }

  static forRootAsync(options: PayboxModuleAsyncOptions): DynamicModule {
    return {
      module: PayboxModule,
      global: options.isGlobal ?? true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: PAYBOX_OPTIONS,

          useFactory: async (...args: any[]) =>
            validatePayboxOptions(await options.useFactory(...args)),
          inject: options.inject ?? [],
        },
        PayboxHttpService,
        PayboxService,
      ],
      exports: [PayboxService],
    }
  }
}
