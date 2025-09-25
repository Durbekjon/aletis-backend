import { Module } from '@nestjs/common';
// import { ProductsController } from './products.controller';
// import { ProductsService } from './products.service';
import { CoreModule } from '../../core/core.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  // imports: [CoreModule, AuthModule],
  // controllers: [ProductsController],
  // providers: [ProductsService],
  // exports: [ProductsService],
})
export class ProductsModule {}
