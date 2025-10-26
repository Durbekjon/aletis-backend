import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async set(key: string, value: any, ttlSeconds?: number) {
    const stringValue = JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.set(key, stringValue, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, stringValue);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async del(key: string) {
    await this.redis.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.redis.keys(pattern);
  }

  async delMultiple(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return await this.redis.del(...keys);
  }

  async setNx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.redis.set(
      key,
      value,
      'PX',
      ttlSeconds * 1000,
      'NX',
    );
    return result === 'OK';
  }
}
