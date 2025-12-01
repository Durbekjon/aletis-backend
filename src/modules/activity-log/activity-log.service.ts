import { PrismaService } from '@core/prisma/prisma.service';
import {
  ActionType,
  EntityType,
  MemberRole,
  Organization,
  Prisma,
} from '@prisma/client';
import { ACTIVITY_TEMPLATES, ActivityTemplateKey } from './activity-templates';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
type LanguageCode = 'en' | 'uz' | 'ru';
import { PaginatedResponseDto } from '@/shared/dto';
import { ActivityLogPaginationDto } from './dto/activity-log-pagination.dto';
import { ActivityLogResponseDto } from './dto/activity-log-response.dto';
import { RedisService } from '@/core/redis/redis.service';

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  private readonly CACHE_KEYS = {
    LIST: (
      orgId: number,
      page: number,
      limit: number,
      order: string,
      lang: string,
      entityType?: string,
      action?: string,
      from?: string,
      to?: string,
    ) =>
      `activity_logs:org:${orgId}:page:${page}:limit:${limit}:order:${order}:lang:${lang}` +
      `${entityType ? `:entity:${entityType}` : ''}${action ? `:action:${action}` : ''}` +
      `${from ? `:from:${from}` : ''}${to ? `:to:${to}` : ''}`,
    LIST_PREFIX: (orgId: number) => `activity_logs:org:${orgId}:*`,
  } as const;

  private readonly TTL = {
    LIST: 120,
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createLog(params: {
    userId?: number;
    organizationId: number;
    entityType: EntityType;
    entityId?: number;
    action: ActionType;
    templateKey: ActivityTemplateKey | string;
    data: Record<string, string>;
    meta?: Record<string, any>;
  }) {
    const {
      userId,
      organizationId,
      entityType,
      entityId,
      action,
      templateKey,
      data,
      meta,
    } = params;
    const template = ACTIVITY_TEMPLATES[templateKey as ActivityTemplateKey];
    const format = (str: string) =>
      str.replace(/\{(\w+)\}/g, (_, key) => (data as any)[key] || '');

    const created = await this.prisma.activityLog.create({
      data: {
        userId,
        organizationId,
        entityType,
        entityId,
        action,
        message_en: format(template.en),
        message_uz: format(template.uz),
        message_ru: format(template.ru),
        meta: (meta ?? null) as unknown as Prisma.InputJsonValue,
      },
    });

    // Invalidate cached lists for this organization (best-effort)
    try {
      const keys = await this.redis.keys(
        this.CACHE_KEYS.LIST_PREFIX(organizationId),
      );
      if (keys.length) {
        await this.redis.delMultiple(keys);
      }
    } catch (error: any) {
      this.logger.warn(
        `Failed to invalidate activity log cache for org ${organizationId}: ${error.message}`,
      );
    }

    return created;
  }

  async getRecentLogs(
    userId: number,
    params: ActivityLogPaginationDto,
  ): Promise<PaginatedResponseDto<ActivityLogResponseDto>> {
    const {
      page = 1,
      limit = 20,
      order = 'desc',
      lang = 'uz',
      entityType,
      action,
      from,
      to,
    } = params;
    const organization = await this.validateUser(userId);
    const cacheKey = this.CACHE_KEYS.LIST(
      organization.id,
      page,
      limit,
      order,
      lang,
      entityType,
      action,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined,
    );

    // Try cache first (best-effort, ignore Redis failures)
    try {
      const cached =
        await this.redis.get<PaginatedResponseDto<ActivityLogResponseDto>>(
          cacheKey,
        );
      if (cached) {
        return cached;
      }
    } catch (error: any) {
      this.logger.warn(
        `Activity log cache get failed for key ${cacheKey}: ${error.message}`,
      );
    }
    const where: Prisma.ActivityLogWhereInput = {
      organizationId: organization.id,
      ...(entityType ? { entityType } : {}),
      ...(action ? { action } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [total, logs] = await this.prisma.$transaction([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: order },
        skip: ((page || 1) - 1) * (limit || 20),
        take: Math.min(Math.max(1, limit || 20), 100),
        include: {
          user: { select: { firstName: true, id: true } },
        },
      }),
    ]);

    const messageKey: Record<
      LanguageCode,
      'message_en' | 'message_uz' | 'message_ru'
    > = {
      en: 'message_en',
      uz: 'message_uz',
      ru: 'message_ru',
    };

    const items: ActivityLogResponseDto[] = logs.map((it) => ({
      id: it.id,
      createdAt: it.createdAt,
      message: (it as any)[messageKey[lang]],
      user: it.user ? { id: it.user.id, firstName: it.user.firstName } : null,
      entityType: it.entityType,
      action: it.action,
      entityId: it.entityId,
      meta: it.meta as any,
    }));

    const result = new PaginatedResponseDto<ActivityLogResponseDto>(
      items,
      total,
      page,
      limit,
    );

    // Save to cache (best-effort, ignore Redis failures)
    try {
      await this.redis.set(cacheKey, result, this.TTL.LIST);
    } catch (error: any) {
      this.logger.warn(
        `Activity log cache set failed for key ${cacheKey}: ${error.message}`,
      );
    }

    return result;
  }

  private async validateUser(userId: number): Promise<Organization> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        member: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    } else if (!user.member) {
      throw new NotFoundException('User is not a member');
    } else if (user.member.role !== MemberRole.ADMIN) {
      throw new ForbiddenException('User is not an admin');
    } else if (!user.member.organization) {
      throw new NotFoundException('Organization not found');
    }
    const organization = user.member.organization;
    return organization;
  }
}
