import { Test } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '@/core/prisma/prisma.service';
import { FileDeleteService } from '@/core/file-delete/file-delete.service';
import { TelegramLoggerService } from '@/core/telegram-logger/telegram-logger.service';

type Mocked<T> = { [K in keyof T]: jest.Mock };

function makePrismaMock() {
  const tx = {
    user: { create: jest.fn(), findUnique: jest.fn() },
    organization: { create: jest.fn() },
    member: { create: jest.fn() },
  };
  return {
    user: {
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
    __tx: tx,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let jwt: Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let config: Mocked<Pick<ConfigService, 'get'>>;
  let telegramLogger: Mocked<Pick<TelegramLoggerService, 'sendEvent'>>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      verifyAsync: jest.fn(),
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret';
        if (key === 'NODE_ENV') return 'test';
        if (key === 'BCRYPT_SALT_ROUNDS') return '4';
        return undefined;
      }),
    };
    telegramLogger = { sendEvent: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: FileDeleteService, useValue: { deleteFileByKey: jest.fn() } },
        { provide: TelegramLoggerService, useValue: telegramLogger },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('creates user + organization + member in one transaction and returns hasOrganization=true', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.__tx.user.create.mockResolvedValue({ id: 7 });
      prisma.__tx.organization.create.mockResolvedValue({
        id: 11,
        name: "Alice's store",
        onboardingProgress: {
          id: 1,
          percentage: 0,
          isFirstProductAdded: false,
          isBotConnected: false,
          isChannelConnected: false,
          nextStep: 'ADD_FIRST_PRODUCT',
          status: 'INCOMPLETE',
        },
      });
      prisma.__tx.member.create.mockResolvedValue({});

      const result = await service.register({
        firstName: 'Alice',
        lastName: 'Doe',
        email: 'alice@example.com',
        password: 'StrongPass123',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.__tx.user.create).toHaveBeenCalled();
      const orgCreateArgs = prisma.__tx.organization.create.mock.calls[0][0];
      expect(orgCreateArgs.data.name).toBe("Alice's store");
      expect(prisma.__tx.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 7,
            organizationId: 11,
            role: 'ADMIN',
            status: 'ACTIVE',
          }),
        }),
      );
      expect(result.hasOrganization).toBe(true);
      expect(result.organization?.id).toBe(11);
      expect(result.accessToken).toBe('signed-token');
      expect(result.refreshToken).toBe('signed-token');
    });

    it('rejects when the email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 7 });
      await expect(
        service.register({
          email: 'alice@example.com',
          password: 'StrongPass123',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('falls back to "My store" when no first name or org name is provided', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.__tx.user.create.mockResolvedValue({ id: 1 });
      prisma.__tx.organization.create.mockResolvedValue({
        id: 1,
        name: 'My store',
        onboardingProgress: null,
      });

      await service.register({
        email: 'nobody@example.com',
        password: 'StrongPass123',
      });
      const orgCreateArgs = prisma.__tx.organization.create.mock.calls[0][0];
      expect(orgCreateArgs.data.name).toBe('My store');
    });
  });

  describe('forgotPassword', () => {
    it('returns { ok: true } and does not touch the DB when the email is unknown', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.forgotPassword('ghost@example.com');
      expect(result).toEqual({ ok: true });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('stores a hashed reset token and never returns the raw token', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 5 });
      prisma.user.update.mockResolvedValue({});

      const result = await service.forgotPassword('alice@example.com');

      expect(result).toEqual({ ok: true });
      expect(result).not.toHaveProperty('resetToken');
      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 5 });
      const stored = updateArgs.data.resetToken;
      expect(typeof stored).toBe('string');
      // bcrypt hashes start with $2 — confirms we're not persisting the raw UUID.
      expect(stored.startsWith('$2')).toBe(true);
    });
  });

  describe('resetPassword', () => {
    it('rejects when the email is unknown', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword('ghost@example.com', 'token', 'NewPass1234'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when the token has expired', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 5,
        resetToken: await bcrypt.hash('the-token', 4),
        resetTokenExpiry: new Date(Date.now() - 1000),
      });
      await expect(
        service.resetPassword('alice@example.com', 'the-token', 'NewPass1234'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when the supplied token does not match', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 5,
        resetToken: await bcrypt.hash('real-token', 4),
        resetTokenExpiry: new Date(Date.now() + 60_000),
      });
      await expect(
        service.resetPassword('alice@example.com', 'wrong-token', 'NewPass1234'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('updates the password and clears reset fields on success', async () => {
      const realToken = 'real-token';
      prisma.user.findUnique.mockResolvedValue({
        id: 5,
        resetToken: await bcrypt.hash(realToken, 4),
        resetTokenExpiry: new Date(Date.now() + 60_000),
      });
      prisma.user.update.mockResolvedValue({});

      await service.resetPassword('alice@example.com', realToken, 'NewPass1234');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5 },
          data: expect.objectContaining({
            resetToken: null,
            resetTokenExpiry: null,
          }),
        }),
      );
      const passwordHash = prisma.user.update.mock.calls[0][0].data.password;
      expect(await bcrypt.compare('NewPass1234', passwordHash)).toBe(true);
    });
  });
});
