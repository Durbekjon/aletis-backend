import { Module } from '@nestjs/common';
import { ModulesModule } from '@modules/modules.module';
import { CoreModule } from '@core/core.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public', 'uploads'),
      serveRoot: '/public/uploads', // URL prefix
    }),
    ModulesModule,
    CoreModule,
  ],
})
export class IndexModule {}
