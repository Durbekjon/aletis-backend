import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { ActionType, EntityType, Prisma } from '@prisma/client';
import { ACTIVITY_TEMPLATES, ActivityTemplateKey } from './activity-templates';

type LanguageCode = 'en' | 'uz' | 'ru';

@Injectable()
export class ActivityLogService {
  constructor(private readonly prisma: PrismaService) {}

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
    const { userId, organizationId, entityType, entityId, action, templateKey, data, meta } = params;
    const template = ACTIVITY_TEMPLATES[templateKey as ActivityTemplateKey];
    const format = (str: string) => str.replace(/\{(\w+)\}/g, (_, key) => (data as any)[key] || '');

    return this.prisma.activityLog.create({
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
  }

  async getRecentLogs(params: {
    organizationId: number;
    limit?: number;
    lang?: LanguageCode;
    userId?: number;
    entityType?: EntityType;
    action?: ActionType;
    from?: Date;
    to?: Date;
  }) {
    const { organizationId, limit = 20, lang = 'uz', userId, entityType, action, from, to } = params;

    const where: Prisma.ActivityLogWhereInput = {
      organizationId,
      ...(userId ? { userId } : {}),
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

    const items = await this.prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, limit), 100),
      include: {
        user: {
          select: { firstName: true, lastName: true, id: true },
        },
      },
    });

    const messageKey: Record<LanguageCode, 'message_en' | 'message_uz' | 'message_ru'> = {
      en: 'message_en',
      uz: 'message_uz',
      ru: 'message_ru',
    };

    return items.map((it) => ({
      id: it.id,
      createdAt: it.createdAt,
      message: (it as any)[messageKey[lang]],
      user: it.user ? { firstName: it.user.firstName } : null,
      entityType: it.entityType,
      action: it.action,
      entityId: it.entityId,
      meta: it.meta,
    }));
  }
}


