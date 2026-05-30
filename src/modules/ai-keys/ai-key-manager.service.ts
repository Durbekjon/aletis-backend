import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiKeyStatus, AiProvider } from '@prisma/client';
import { PrismaService } from '@/core/prisma/prisma.service';
import { EncryptionService } from '@/core/encryption/encryption.service';

export interface AcquiredAiKey {
  /** DB id, or null if this key came from the GEMINI_API_KEY env fallback. */
  id: number | null;
  apiKey: string;
}

/**
 * Cost-saving multi-key rotation for Gemini-style providers.
 *
 * - `acquire` returns the active key that has been used least recently (a
 *   crude form of round-robin that doesn't need Redis counters).
 * - When the caller hits a quota error, it reports back via `markExhausted`;
 *   the row gains an `exhaustedAt` timestamp and is skipped on the next pick.
 * - A nightly cron clears `exhaustedAt` since Gemini quotas reset daily.
 *
 * The manager throws `ServiceUnavailableException` if all keys are exhausted
 * so the caller can surface that as 503 rather than silently fail.
 */
@Injectable()
export class AiKeyManagerService {
  private readonly logger = new Logger(AiKeyManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly configService: ConfigService,
  ) {}

  async acquire(
    provider: AiProvider = AiProvider.GEMINI,
    options: { excludeIds?: number[]; allowEnvFallback?: boolean } = {},
  ): Promise<AcquiredAiKey> {
    const allowEnvFallback = options.allowEnvFallback ?? true;
    const row = await this.prisma.aiApiKey.findFirst({
      where: {
        provider,
        status: AiKeyStatus.ACTIVE,
        exhaustedAt: null,
        ...(options.excludeIds?.length
          ? { id: { notIn: options.excludeIds } }
          : {}),
      },
      orderBy: [{ lastUsedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    });
    if (row) {
      await this.prisma.aiApiKey.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
      });
      return {
        id: row.id,
        apiKey: this.encryption.decrypt(row.encryptedKey),
      };
    }

    // Legacy env-var fallback. Lets the system keep working before any DB
    // keys are registered, but the caller can suppress it during in-call
    // rotation (don't re-try the same env key after it 429'd).
    if (allowEnvFallback && provider === AiProvider.GEMINI) {
      const envKey = this.configService.get<string>('GEMINI_API_KEY');
      if (envKey) {
        this.logger.warn(
          'Falling back to GEMINI_API_KEY env var — register DB keys via /v1/admin/ai-keys to enable rotation.',
        );
        return { id: null, apiKey: envKey };
      }
    }

    this.logger.error(`No usable ${provider} key available`);
    throw new ServiceUnavailableException(
      `No active ${provider} API key available — all quotas may be exhausted.`,
    );
  }

  async markExhausted(id: number | null, reason: string): Promise<void> {
    if (id == null) return; // env-var fallback can't be marked
    await this.prisma.aiApiKey.update({
      where: { id },
      data: {
        exhaustedAt: new Date(),
        lastErrorAt: new Date(),
        lastError: reason.slice(0, 500),
      },
    });
    this.logger.warn(`AI key ${id} marked exhausted: ${reason}`);
  }

  async markError(id: number | null, reason: string): Promise<void> {
    if (id == null) return;
    await this.prisma.aiApiKey.update({
      where: { id },
      data: {
        lastErrorAt: new Date(),
        lastError: reason.slice(0, 500),
      },
    });
  }

  /**
   * Wipe `exhaustedAt` every UTC midnight — Gemini's quotas reset daily.
   * Manual override available via the admin CRUD (`clearExhausted: true`).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'ai-key-exhaustion-reset',
    timeZone: 'UTC',
  })
  async resetExhaustedDaily(): Promise<void> {
    const result = await this.prisma.aiApiKey.updateMany({
      where: { exhaustedAt: { not: null } },
      data: { exhaustedAt: null },
    });
    if (result.count > 0) {
      this.logger.log(`Reset exhausted flag on ${result.count} AI key(s)`);
    }
  }
}
