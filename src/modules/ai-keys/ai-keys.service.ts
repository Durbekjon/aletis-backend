import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiApiKey, AiKeyStatus, AiProvider, Prisma } from '@prisma/client';
import { PrismaService } from '@/core/prisma/prisma.service';
import { EncryptionService } from '@/core/encryption/encryption.service';
import {
  AiKeyResponseDto,
  CreateAiKeyDto,
  UpdateAiKeyDto,
} from './dto';

/**
 * Admin-only CRUD over the `AiApiKey` table. All persistence goes through
 * EncryptionService so the raw key never lives in plaintext on disk.
 */
@Injectable()
export class AiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async list(): Promise<AiKeyResponseDto[]> {
    const rows = await this.prisma.aiApiKey.findMany({
      orderBy: [{ provider: 'asc' }, { label: 'asc' }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async findById(id: number): Promise<AiKeyResponseDto> {
    return this.toResponse(await this.requireKey(id));
  }

  async create(dto: CreateAiKeyDto): Promise<AiKeyResponseDto> {
    try {
      const created = await this.prisma.aiApiKey.create({
        data: {
          provider: dto.provider ?? AiProvider.GEMINI,
          label: dto.label,
          encryptedKey: this.encryption.encrypt(dto.apiKey),
          status: dto.status ?? AiKeyStatus.ACTIVE,
        },
      });
      return this.toResponse(created);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `An AI key with label "${dto.label}" already exists for that provider.`,
        );
      }
      throw err;
    }
  }

  async update(id: number, dto: UpdateAiKeyDto): Promise<AiKeyResponseDto> {
    await this.requireKey(id);
    const data: Prisma.AiApiKeyUpdateInput = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.apiKey !== undefined) {
      data.encryptedKey = this.encryption.encrypt(dto.apiKey);
    }
    if (dto.clearExhausted) {
      data.exhaustedAt = null;
      data.lastError = null;
      data.lastErrorAt = null;
    }
    try {
      const updated = await this.prisma.aiApiKey.update({
        where: { id },
        data,
      });
      return this.toResponse(updated);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'An AI key with that label already exists for the same provider.',
        );
      }
      throw err;
    }
  }

  async remove(id: number): Promise<void> {
    await this.requireKey(id);
    await this.prisma.aiApiKey.delete({ where: { id } });
  }

  private async requireKey(id: number): Promise<AiApiKey> {
    const row = await this.prisma.aiApiKey.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`AI key ${id} not found`);
    }
    return row;
  }

  private toResponse(row: AiApiKey): AiKeyResponseDto {
    return {
      id: row.id,
      provider: row.provider,
      label: row.label,
      status: row.status,
      exhaustedAt: row.exhaustedAt,
      usageCount: row.usageCount,
      lastUsedAt: row.lastUsedAt,
      lastErrorAt: row.lastErrorAt,
      lastError: row.lastError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
