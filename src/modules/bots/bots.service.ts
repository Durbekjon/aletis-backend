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
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly webhookHelper: WebhookHelperService,
  ) {}
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
    return bot;
  }

  async getBots(
    userId: number,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<any>> {
    const organization = await this.validateUser(userId);
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

    return new PaginatedResponseDto<any>(
      botsWithStatistics,
      total,
      paginationDto.page ?? 1,
      paginationDto.limit ?? 20,
    );
  }

  async getBotDetails(userId: number, botId: number): Promise<any> {
    const organization = await this.validateUser(userId);
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId, organizationId: organization.id },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }

    // Calculate and add statistics
    const statistics = await this.calculateBotStatistics(bot.id);

    return {
      ...bot,
      statistics,
    };
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
    return await this.prisma.bot.update({
      where: { id: botId },
      data: {
        token: encryptedToken,
        status: bot.status,
        telegramId: id,
        name: first_name,
        username: username,
      },
    });
  }

  async deleteBot(userId: number, botId: number): Promise<Bot> {
    const organization = await this.validateUser(userId);
    const bot = await this.prisma.bot.delete({
      where: { id: botId, organizationId: organization.id },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
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

    return {
      totalMessages,
      activeChats: activeChats.length,
      uptime,
      lastActive,
    };
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
