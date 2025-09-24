import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: process.env.NODE_ENV === 'production' ? 300 : 5000, // Very generous for development
      },
      {
        ttl: 60000, // 1 minute
        limit: process.env.NODE_ENV === 'production' ? 50 : 1000, // Very generous for development
        name: 'sensitive',
      },
      {
        ttl: 60000, // 1 minute
        limit: process.env.NODE_ENV === 'production' ? 100 : 2000, // Very generous for development
        name: 'auth',
      },
    ]),
  ],
  providers: [
    // Only apply throttling in production or if explicitly enabled
    ...(process.env.NODE_ENV === 'production' || process.env.ENABLE_THROTTLING === 'true' ? [{
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    }] : []),
  ],
})
export class SecurityModule {}
