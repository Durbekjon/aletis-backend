import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        const client = new Redis({
          host: '127.0.0.1',
          port: 6379,
        });
        client.on('connect', () => console.log('✅ Redis connected'));
        client.on('error', (err: any) => console.error('❌ Redis error:', err));
        return client;
      },
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
