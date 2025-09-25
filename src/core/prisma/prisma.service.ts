import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Query logging for development
    if (process.env.NODE_ENV === 'development') {
      (this as any).$on('query', (e: any) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Params: ${e.params}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }

    (this as any).$on('error', (e: any) => {
      this.logger.error(`Prisma Error: ${e.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connected successfully');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  // Helper method for transaction handling
  async transaction<T>(fn: (prisma: PrismaService) => Promise<T>): Promise<T> {
    return this.$transaction(fn);
  }
}
