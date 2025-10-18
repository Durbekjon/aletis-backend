import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import {
  Bot,
  BotStatus,
  MemberRole,
  Organization,
  Prisma,
  SenderType,
} from '@prisma/client';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { EncryptionService } from '@core/encryption/encryption.service';
import {
  webhookResponse,
  WebhookHelperService,
} from '@core/webhook-helper/webhook-helper.service';
import { PaginationDto, PaginatedResponseDto } from '@/shared/dto';
import { BotStatisticsResponseDto } from './dto/bot-response.dto';
import { RedisService } from '@core/redis/redis.service';
export interface TelegramBotInfo {
  id: string;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
  can_connect_to_business: boolean;
  has_main_web_app: boolean;
}

@Injectable()
export class BotsService {
  // Cache key patterns for consistent naming
  private readonly CACHE_KEYS = {
    BOT: (id: number) => `bot:${id}`,
    BOTS_LIST: (orgId: number, page: number, limit: number, search?: string) =>
      `bots:org:${orgId}:page:${page}:limit:${limit}${search ? `:search:${search}` : ''}`,
    BOT_STATS: (id: number) => `bot:${id}:stats`,
    BOT_DETAILS: (id: number) => `bot:${id}:details`,
    ORG_BOTS: (orgId: number) => `org:${orgId}:bots`,
  };

  // TTL values in seconds
  private readonly TTL = {
    BOT: 300, // 5 minutes - bot data changes infrequently
    BOTS_LIST: 180, // 3 minutes - list data changes more frequently
    BOT_STATS: 60, // 1 minute - statistics change frequently
    BOT_DETAILS: 300, // 5 minutes - details change infrequently
    ORG_BOTS: 600, // 10 minutes - organization bot list
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly webhookHelper: WebhookHelperService,
    private readonly redis: RedisService,
  ) {}

  // ==================== CACHE HELPER METHODS ====================

  /**
   * Generic cache get method with type safety
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    try {
      return await this.redis.get<T>(key);
    } catch (error) {
      console.warn(`Cache get failed for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Generic cache set method with TTL
   */
  private async setCache<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      await this.redis.set(key, value, ttl);
    } catch (error) {
      console.warn(`Cache set failed for key ${key}:`, error);
    }
  }

  /**
   * Invalidate cache by key pattern
   */
  private async invalidateCache(pattern: string): Promise<void> {
    try {
      // Note: In production, you might want to use SCAN instead of KEYS for better performance
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.delMultiple(keys);
      }
    } catch (error) {
      console.warn(`Cache invalidation failed for pattern ${pattern}:`, error);
    }
  }

  /**
   * Invalidate all bot-related caches for an organization
   */
  private async invalidateOrganizationBotCaches(
    organizationId: number,
  ): Promise<void> {
    const patterns = [
      `bots:org:${organizationId}:*`,
      `org:${organizationId}:bots`,
    ];

    await Promise.all(patterns.map((pattern) => this.invalidateCache(pattern)));
  }

  /**
   * Invalidate all caches for a specific bot
   */
  private async invalidateBotCaches(botId: number): Promise<void> {
    const patterns = [`bot:${botId}*`];

    await Promise.all(patterns.map((pattern) => this.invalidateCache(pattern)));
  }
  /**
   * Creates a new bot
   * @param userId - The ID of the user creating the bot
   * @param dto - The data for the bot
   * @returns The created bot
   */
  async createBot(userId: number, dto: CreateBotDto): Promise<Bot> {
    const organization = await this.validateUser(userId);
    const { id, first_name, username } = await this.validateBotByTelegramAPI(
      dto.token,
    );
    const encryptedToken = this.encryption.encrypt(dto.token);
    let botsCount = await this.prisma.bot.count({
      where: { organizationId: organization.id, isDefault: true },
    });
    let isDefault = false;
    if (botsCount === 0) {
      isDefault = true;
    }
    const bot = await this.prisma.bot.create({
      data: {
        token: encryptedToken,
        organizationId: organization.id,
        status: BotStatus.INACTIVE,
        telegramId: id,
        isDefault: isDefault,
        name: first_name,
        username: username,
      },
    });

    // Invalidate organization bot caches since a new bot was created
    await this.invalidateOrganizationBotCaches(organization.id);

    return bot;
  }

  async getBots(
    userId: number,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<any>> {
    const organization = await this.validateUser(userId);

    // Create cache key for this specific query
    const cacheKey = this.CACHE_KEYS.BOTS_LIST(
      organization.id,
      paginationDto.page ?? 1,
      paginationDto.limit ?? 20,
      paginationDto.search,
    );

    // Try to get from cache first
    const cachedResult =
      await this.getFromCache<PaginatedResponseDto<any>>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // If not in cache, fetch from database
    const searchFilter = paginationDto.search
      ? {
          OR: [
            {
              name: {
                contains: paginationDto.search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            {
              username: {
                contains: paginationDto.search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          ],
        }
      : {};

    const [bots, total] = await this.prisma.$transaction([
      this.prisma.bot.findMany({
        where: { organizationId: organization.id, ...searchFilter },
        skip: paginationDto.skip,
        take: paginationDto.take,
        orderBy: { createdAt: paginationDto.order },
      }),
      this.prisma.bot.count({
        where: { organizationId: organization.id, ...searchFilter },
      }),
    ]);

    // Calculate statistics for each bot
    const botsWithStatistics = await Promise.all(
      bots.map(async (bot) => {
        const statistics = await this.calculateBotStatistics(bot.id);
        return {
          ...bot,
          statistics,
        };
      }),
    );

    const result = new PaginatedResponseDto<any>(
      botsWithStatistics,
      total,
      paginationDto.page ?? 1,
      paginationDto.limit ?? 20,
    );

    // Cache the result
    await this.setCache(cacheKey, result, this.TTL.BOTS_LIST);

    return result;
  }

  async getBotDetails(userId: number, botId: number): Promise<any> {
    const organization = await this.validateUser(userId);

    // Create cache key for bot details
    const cacheKey = this.CACHE_KEYS.BOT_DETAILS(botId);

    // Try to get from cache first
    const cachedResult = await this.getFromCache<any>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // If not in cache, fetch from database
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId, organizationId: organization.id },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }

    // Calculate and add statistics
    const statistics = await this.calculateBotStatistics(bot.id);

    const result = {
      ...bot,
      statistics,
    };

    // Cache the result
    await this.setCache(cacheKey, result, this.TTL.BOT_DETAILS);

    return result;
  }

  async updateBot(
    userId: number,
    botId: number,
    dto: UpdateBotDto,
  ): Promise<Bot> {
    const organization = await this.validateUser(userId);
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId, organizationId: organization.id },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    if (dto.isDefault !== undefined) {
      await Promise.all([
        this.prisma.bot.updateMany({
          where: { organizationId: organization.id, isDefault: true },
          data: { isDefault: false },
        }),
        this.prisma.bot.update({
          where: { id: botId },
          data: { isDefault: dto.isDefault },
        }),
      ]);
    }
    const decryptedToken = this.encryption.decrypt(bot.token);
    await this.webhookHelper.deleteWebhook(decryptedToken);

    const { id, first_name, username } = await this.validateBotByTelegramAPI(
      dto.token,
    );
    const encryptedToken = this.encryption.encrypt(dto.token);
    const updatedBot = await this.prisma.bot.update({
      where: { id: botId },
      data: {
        token: encryptedToken,
        status: bot.status,
        telegramId: id,
        name: first_name,
        username: username,
      },
    });

    // Invalidate all caches related to this bot and organization
    await Promise.all([
      this.invalidateBotCaches(botId),
      this.invalidateOrganizationBotCaches(organization.id),
    ]);

    return updatedBot;
  }

  async deleteBot(userId: number, botId: number): Promise<Bot> {
    const organization = await this.validateUser(userId);
    const bot = await this.prisma.bot.delete({
      where: { id: botId, organizationId: organization.id },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }

    // Invalidate all caches related to this bot and organization
    await Promise.all([
      this.invalidateBotCaches(botId),
      this.invalidateOrganizationBotCaches(organization.id),
    ]);

    return bot;
  }

  async startBot(userId: number, botId: number): Promise<webhookResponse> {
    const organization = await this.validateUser(userId);
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId, organizationId: organization.id },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    const decryptedToken = this.encryption.decrypt(bot.token);
    const result = await this.webhookHelper.setWebhook(
      decryptedToken,
      botId,
      organization.id,
    );
    if (result.isOK) {
      await this.prisma.bot.update({
        where: { id: botId },
        data: {
          status: BotStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });

      // Invalidate caches since bot status changed
      await Promise.all([
        this.invalidateBotCaches(botId),
        this.invalidateOrganizationBotCaches(organization.id),
      ]);
    }
    return result;
  }

  async stopBot(userId: number, botId: number): Promise<webhookResponse> {
    const organization = await this.validateUser(userId);
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId, organizationId: organization.id },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    const decryptedToken = this.encryption.decrypt(bot.token);
    const result = await this.webhookHelper.deleteWebhook(decryptedToken);
    if (result.isOK) {
      await this.prisma.bot.update({
        where: { id: botId },
        data: {
          status: BotStatus.INACTIVE,
          deactivatedAt: new Date(),
        },
      });

      // Invalidate caches since bot status changed
      await Promise.all([
        this.invalidateBotCaches(botId),
        this.invalidateOrganizationBotCaches(organization.id),
      ]);
    }
    return result;
  }

  async _getBot(botId: number, organizationId: number): Promise<Bot | null> {
    return this.prisma.bot.findUnique({
      where: { id: botId, organizationId },
    });
  }

  /**
   * Calculate bot statistics including total messages, active chats, uptime, and last active time
   * @param botId - The bot ID to calculate statistics for
   * @returns BotStatisticsResponseDto with calculated statistics
   */
  async calculateBotStatistics(
    botId: number,
  ): Promise<BotStatisticsResponseDto> {
    // Create cache key for bot statistics
    const cacheKey = this.CACHE_KEYS.BOT_STATS(botId);

    // Try to get from cache first
    const cachedStats =
      await this.getFromCache<BotStatisticsResponseDto>(cacheKey);
    if (cachedStats) {
      return cachedStats;
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get bot details
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
      select: { status: true, activatedAt: true, deactivatedAt: true },
    });

    if (!bot) {
      throw new NotFoundException('Bot not found');
    }

    // Calculate total messages
    const totalMessages = await this.prisma.message.count({
      where: { botId, sender: SenderType.BOT },
    });

    // Calculate active chats (unique customers who sent or received messages in last 24 hours)
    const activeChats = await this.prisma.message.findMany({
      where: {
        botId,
        createdAt: {
          gte: twentyFourHoursAgo,
        },
      },
      select: {
        customerId: true,
      },
      distinct: ['customerId'],
    });

    // Calculate uptime
    let uptime = '0 hours';
    if (bot.status === BotStatus.ACTIVE && bot.activatedAt) {
      const uptimeMs = now.getTime() - bot.activatedAt.getTime();
      const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
      const uptimeMinutes = Math.floor(
        (uptimeMs % (1000 * 60 * 60)) / (1000 * 60),
      );

      if (uptimeHours > 0) {
        uptime = `${uptimeHours} hour${uptimeHours > 1 ? 's' : ''}`;
        if (uptimeMinutes > 0) {
          uptime += ` ${uptimeMinutes} minute${uptimeMinutes > 1 ? 's' : ''}`;
        }
      } else {
        uptime = `${uptimeMinutes} minute${uptimeMinutes > 1 ? 's' : ''}`;
      }
    } else if (
      bot.status === BotStatus.INACTIVE &&
      bot.activatedAt &&
      bot.deactivatedAt
    ) {
      const uptimeMs = bot.deactivatedAt.getTime() - bot.activatedAt.getTime();
      const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
      const uptimeMinutes = Math.floor(
        (uptimeMs % (1000 * 60 * 60)) / (1000 * 60),
      );

      if (uptimeHours > 0) {
        uptime = `${uptimeHours} hour${uptimeHours > 1 ? 's' : ''}`;
        if (uptimeMinutes > 0) {
          uptime += ` ${uptimeMinutes} minute${uptimeMinutes > 1 ? 's' : ''}`;
        }
      } else {
        uptime = `${uptimeMinutes} minute${uptimeMinutes > 1 ? 's' : ''}`;
      }
    }

    // Get last active time (latest message where sender = 'BOT')
    const lastBotMessage = await this.prisma.message.findFirst({
      where: {
        botId,
        sender: 'BOT',
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
      },
    });

    const lastActive = lastBotMessage?.createdAt.toISOString() || null;

    const result = {
      totalMessages,
      activeChats: activeChats.length,
      uptime,
      lastActive,
    };

    // Cache the result with short TTL since statistics change frequently
    await this.setCache(cacheKey, result, this.TTL.BOT_STATS);

    return result;
  }

  private async validateBotByTelegramAPI(
    token: string,
  ): Promise<TelegramBotInfo> {
    const isValidToken = this.isValidBotToken(token);
    if (!isValidToken) throw new BadRequestException('Invalid bot token');
    const url = `https://api.telegram.org/bot${token}/getMe`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok || !data.result?.is_bot) {
      throw new BadRequestException('Invalid bot token: Not a valid bot');
    }
    data.result.id = String(data.result.id);
    return data.result;
  }

  private isValidBotToken(token: string): boolean {
    const tokenPattern = /^\d+:[A-Za-z0-9_-]{35,}$/;
    return tokenPattern.test(token);
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
