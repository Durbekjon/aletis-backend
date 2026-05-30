import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '@/core/prisma/prisma.service';

const HEADER_NAME = 'x-telegram-bot-api-secret-token';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const botIdRaw = req.params?.botId;
    const botId = Number(botIdRaw);
    if (!botId || Number.isNaN(botId)) {
      throw new UnauthorizedException('Invalid botId');
    }

    const provided = req.header(HEADER_NAME);
    if (!provided) {
      this.logger.warn(`Webhook for bot ${botId} missing signature header`);
      throw new UnauthorizedException('Missing webhook signature');
    }

    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
      select: { webhookSecret: true },
    });
    if (!bot?.webhookSecret) {
      this.logger.warn(`Webhook for bot ${botId} has no registered secret`);
      throw new UnauthorizedException('Webhook signature is not configured');
    }

    if (!constantTimeEqual(provided, bot.webhookSecret)) {
      this.logger.warn(`Webhook for bot ${botId} has invalid signature`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
