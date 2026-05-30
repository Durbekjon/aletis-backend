import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { exec } from 'child_process';
import { promises as fs, createReadStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DEFAULT_CRON = '0 3 * * *'; // daily at 03:00
const JOB_NAME = 'db-backup-daily';
const TELEGRAM_DOCUMENT_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB for non-premium bots

@Injectable()
export class BackupService implements OnModuleInit {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log(
        'Backups disabled. Set BACKUP_ENABLED=true and configure BACKUP_TELEGRAM_* to enable.',
      );
      return;
    }
    const cronExpr =
      this.configService.get<string>('BACKUP_CRON') ?? DEFAULT_CRON;
    const job = new CronJob(cronExpr, () => {
      this.runScheduled().catch((err) =>
        this.logger.error(`Scheduled backup failed: ${err.message}`, err.stack),
      );
    });
    this.schedulerRegistry.addCronJob(JOB_NAME, job as any);
    job.start();
    this.logger.log(`Backup scheduled with cron "${cronExpr}"`);
  }

  /**
   * Public entry point so an admin endpoint or another service can trigger a
   * backup on demand without waiting for the next cron tick.
   */
  async runScheduled(): Promise<void> {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for backups');
    }
    const botToken = this.configService.get<string>('BACKUP_TELEGRAM_BOT_TOKEN');
    const chatId = this.configService.get<string>('BACKUP_TELEGRAM_CHAT_ID');
    if (!botToken || !chatId) {
      throw new Error(
        'BACKUP_TELEGRAM_BOT_TOKEN and BACKUP_TELEGRAM_CHAT_ID must be set',
      );
    }

    const dumpPath = await this.runPgDump(databaseUrl);
    try {
      const stats = await fs.stat(dumpPath);
      if (stats.size > TELEGRAM_DOCUMENT_LIMIT_BYTES) {
        throw new Error(
          `Dump (${stats.size} bytes) exceeds Telegram's 50 MB document limit. Move to S3 or split the dump.`,
        );
      }
      await this.sendDocumentToTelegram(botToken, chatId, dumpPath, stats.size);
      this.logger.log(`Backup sent (${stats.size} bytes): ${dumpPath}`);
    } finally {
      await fs.unlink(dumpPath).catch(() => undefined);
    }
  }

  private isEnabled(): boolean {
    return (
      (this.configService.get<string>('BACKUP_ENABLED') ?? '').toLowerCase() ===
      'true'
    );
  }

  private async runPgDump(databaseUrl: string): Promise<string> {
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace(/T/, '_')
      .replace(/Z$/, '');
    const file = join(tmpdir(), `aletis-backup-${ts}.sql.gz`);
    // `pg_dump --format=plain` + `gzip` keeps things compatible with any psql.
    // The connection URI is passed as the only positional arg.
    const cmd = `pg_dump "${databaseUrl}" --no-owner --no-privileges | gzip > "${file}"`;
    await execAsync(cmd, {
      // Allow up to 20s buffered stderr — actual data goes to the file via shell pipe.
      maxBuffer: 20 * 1024 * 1024,
    });
    return file;
  }

  private async sendDocumentToTelegram(
    botToken: string,
    chatId: string,
    filePath: string,
    sizeBytes: number,
  ): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/sendDocument`;

    const form = new FormData();
    form.set('chat_id', chatId);
    form.set('caption', this.buildCaption(filePath, sizeBytes));
    const buffer = await fs.readFile(filePath);
    form.set(
      'document',
      new Blob([buffer], { type: 'application/gzip' }),
      filePath.split('/').pop() ?? 'backup.sql.gz',
    );

    const response = await fetch(url, { method: 'POST', body: form });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (!response.ok || !body.ok) {
      throw new Error(
        `Telegram sendDocument failed (${response.status}): ${body.description ?? 'unknown error'}`,
      );
    }
    // `createReadStream` import is intentionally kept for callers that may
    // later want to switch to a streaming upload (e.g. node-fetch + form-data).
    void createReadStream;
  }

  private buildCaption(filePath: string, sizeBytes: number): string {
    const mb = (sizeBytes / 1024 / 1024).toFixed(2);
    const fileName = filePath.split('/').pop() ?? 'backup.sql.gz';
    return [
      '📦 Aletis daily backup',
      `File: ${fileName}`,
      `Size: ${mb} MB`,
      `When: ${new Date().toISOString()}`,
    ].join('\n');
  }
}
