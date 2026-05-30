import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import Redis, { RedisOptions } from 'ioredis';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisClient');
        const password = configService.get<string>('REDIS_PASSWORD');
        const tlsEnabled =
          configService.get<string>('REDIS_TLS') === 'true' ||
          configService.get<string>('REDIS_TLS') === '1';

        const opts: RedisOptions = {
          host: configService.get<string>('REDIS_HOST') || '127.0.0.1',
          port: configService.get<number>('REDIS_PORT') || 6379,
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
        };
        if (password) opts.password = password;
        if (tlsEnabled) opts.tls = {};

        const client = new Redis(opts);
        client.on('connect', () => logger.log('Redis connected'));
        client.on('ready', () => logger.log('Redis ready'));
        client.on('error', (err) =>
          logger.error(`Redis error: ${err.message}`, err.stack),
        );
        client.on('end', () => logger.warn('Redis connection closed'));

        // Kick off the connection without blocking module init.
        client.connect().catch((err) =>
          logger.error(
            `Initial Redis connection failed: ${err.message}`,
            err.stack,
          ),
        );

        return client;
      },
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
