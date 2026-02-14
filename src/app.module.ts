import { Module } from '@nestjs/common';
import { ModulesModule } from '@modules/modules.module';
import { CoreModule } from '@core/core.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public', 'uploads'),
      serveRoot: '/public/uploads',
      serveStaticOptions: {
        setHeaders: (res, path) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
        },
      },
    }),
    ModulesModule,
    CoreModule,
  ],
})
export class AppModule {}
