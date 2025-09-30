import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import { Bot, MemberRole } from '@prisma/client';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { EncryptionService } from '@core/encryption/encryption.service';
import { webhookResponse, WebhookService } from '@core/webhook/webhook.service';
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
    private readonly webhook: WebhookService,
  ) {}
  /**
   * Creates a new bot
   * @param userId - The ID of the user creating the bot
   * @param dto - The data for the bot
   * @returns The created bot
   */
  async createBot(userId: number, dto: CreateBotDto): Promise<Bot | void> {
    const organization = await this.validateUser(userId);
    const { id, first_name, username } = await this.validateBotByTelegramAPI(
      dto.token,
    );
    console.log(id,first_name,username)
    const encryptedToken = this.encryption.encrypt(dto.token);
    const bot = await this.prisma.bot.create({
      data: {
        token: encryptedToken,
        organizationId: organization.id,
        isEnabled: false,
        telegramId: id,
        name: first_name,
        username: username,
      },
    });
    return bot;
  }

  async getBots(userId: number): Promise<Bot[]> {
    const organization = await this.validateUser(userId);
    const bots = await this.prisma.bot.findMany({
      where: { organizationId: organization.id },
    });
    return bots;
  }

  async getBotDetails(userId: number, botId: number): Promise<Bot> {
    const organization = await this.validateUser(userId);
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId, organizationId: organization.id },
    });
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    return bot;
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

    const { id, first_name, username } = await this.validateBotByTelegramAPI(
      dto.token,
    );
    const encryptedToken = this.encryption.encrypt(dto.token);
    return await this.prisma.bot.update({
      where: { id: botId },
      data: {
        token: encryptedToken,
        isEnabled: bot.isEnabled,
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
    const result = await this.webhook.setWebhook(decryptedToken);
    if (result.isOK) {
      await this.prisma.bot.update({ where: { id: botId }, data:{isEnabled:true} })
    }
    return result
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
    const result = await this.webhook.deleteWebhook(decryptedToken);
    if (result.isOK) {
      await this.prisma.bot.update({
        where: { id: botId },
        data: { isEnabled: false },
      });
    }
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

  private async validateUser(userId: number) {
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
