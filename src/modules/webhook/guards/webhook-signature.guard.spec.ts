import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { PrismaService } from '@/core/prisma/prisma.service';

function buildContext(opts: {
  botIdParam?: string;
  header?: string;
}): ExecutionContext {
  const req = {
    params: opts.botIdParam !== undefined ? { botId: opts.botIdParam } : {},
    header: (name: string) =>
      name.toLowerCase() === 'x-telegram-bot-api-secret-token'
        ? opts.header
        : undefined,
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('WebhookSignatureGuard', () => {
  let prisma: { bot: { findUnique: jest.Mock } };
  let guard: WebhookSignatureGuard;

  beforeEach(() => {
    prisma = { bot: { findUnique: jest.fn() } };
    guard = new WebhookSignatureGuard(prisma as unknown as PrismaService);
  });

  it('throws when the botId param is missing or non-numeric', async () => {
    await expect(
      guard.canActivate(buildContext({ header: 'whatever' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      guard.canActivate(buildContext({ botIdParam: 'abc', header: 'x' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when the secret header is missing', async () => {
    await expect(
      guard.canActivate(buildContext({ botIdParam: '5' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.bot.findUnique).not.toHaveBeenCalled();
  });

  it('throws when the bot has no registered secret', async () => {
    prisma.bot.findUnique.mockResolvedValue({ webhookSecret: null });
    await expect(
      guard.canActivate(buildContext({ botIdParam: '5', header: 'whatever' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when the supplied secret does not match', async () => {
    prisma.bot.findUnique.mockResolvedValue({ webhookSecret: 'expected' });
    await expect(
      guard.canActivate(buildContext({ botIdParam: '5', header: 'wrong' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns true when the secret matches', async () => {
    prisma.bot.findUnique.mockResolvedValue({ webhookSecret: 'correct' });
    await expect(
      guard.canActivate(buildContext({ botIdParam: '5', header: 'correct' })),
    ).resolves.toBe(true);
    expect(prisma.bot.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      select: { webhookSecret: true },
    });
  });
});
