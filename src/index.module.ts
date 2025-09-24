import { Module } from '@nestjs/common';
import { ModulesModule } from '@modules/modules.module';
import { CoreModule } from '@core/core.module';

@Module({
  imports: [ModulesModule, CoreModule],
})
export class IndexModule {}
