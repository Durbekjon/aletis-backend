import { PrismaService } from '@core/prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ActionType, EntityType } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Bot, ConnectionStatus, Prisma, type Channel } from '@prisma/client';
import { PaginatedResponseDto, PaginationDto } from '@/shared/dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { EncryptionService } from '@/core/encryption/encryption.service';
import { TelegramService } from '../telegram/telegram.service';
import { FileService } from '../file/file.service';

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

interface TelegramChatMemberAdministrator {
  user: TelegramUser;
  status: 'administrator' | 'member';
  can_be_edited?: boolean;
  can_manage_chat?: boolean;
  can_change_info?: boolean;
  can_post_messages?: boolean;
  can_edit_messages?: boolean;
  can_delete_messages?: boolean;
  can_invite_users?: boolean;
  can_restrict_members?: boolean;
  can_promote_members?: boolean;
  can_manage_video_chats?: boolean;
  can_post_stories?: boolean;
  can_edit_stories?: boolean;
  can_delete_stories?: boolean;
  can_manage_direct_messages?: boolean;
  is_anonymous?: boolean;
  can_manage_voice_chats?: boolean;
}

interface TelegramGetChatMemberResponse {
  ok: boolean;
  result?: TelegramChatMemberAdministrator;
  description?: string;
  error_code?: number;
}

interface TelegramChat {
  id: number;
  type: string;
  title: string;
  username?: string;
}

interface TelegramGetChatResponse {
  ok: boolean;
  result?: TelegramChat;
  description?: string;
  error_code?: number;
}

interface RequiredPermissions {
  can_post_messages: boolean;
  can_edit_messages: boolean;
  can_delete_messages: boolean;
}

const REQUIRED_PERMISSIONS: (keyof RequiredPermissions)[] = [
  'can_post_messages',
  'can_edit_messages',
  'can_delete_messages',
];

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly activityLogService: ActivityLogService,
    private readonly telegramService: TelegramService,
    private readonly fileService: FileService,
  ) {}

  async createChannel(
    userId: number,
    body: CreateChannelDto,
  ): Promise<Channel | { channel: Channel; code: number }> {
    this.logger.log(`Creating channel for user ${userId}`);

    const organizationId = await this.getUserOrganizationId(userId);
    const bot = await this.validateBotOwnership(body.botId, organizationId);

    return this.createPublicChannel(body, organizationId, bot);
  }

  private async createPublicChannel(
    body: CreateChannelDto,
    organizationId: number,
    bot: Bot,
  ): Promise<Channel> {
    if (!body.username) {
      throw new BadRequestException('Username is required for public channels');
    }

    const username = this.sanitizeUsername(body.username);

    // Get channel info from Telegram
    const channelInfo = await this.getChannelInfo(username, bot);

    // Verify channel status
    const status = await this.verifyChannelStatus(username, bot);

    this.logger.log(`Public channel status: ${status} for @${username}`);
    const isChannelExists = await this.prisma.channel.findUnique({
      where: {
        telegramId: channelInfo.id.toString(),
      },
    });

    if (isChannelExists) {
      throw new BadRequestException('Channel already exists');
    }
    const channel = await this.prisma.channel.create({
      data: {
        telegramId: channelInfo.id.toString(),
        title: channelInfo.title,
        status,
        username,
        organizationId,
        connectedBotId: bot.id,
      },
    });

    // Fetch and save channel logo (non-blocking, fail gracefully)
    this.logger.log(
      `[CHANNEL CREATION] Starting logo fetch for channelId=${channel.id}, telegramId=${channelInfo.id}`,
    );
    const decryptedToken = this.encryptionService.decrypt(bot.token);
    this.fetchAndSaveChannelLogo(
      decryptedToken,
      channelInfo.id.toString(),
      channel.id,
      organizationId,
    ).catch((error) => {
      this.logger.error(
        `[CHANNEL CREATION] Failed to fetch channel logo for channelId=${channel.id}: ${error.message}`,
        error.stack,
      );
    });

    await this.activityLogService.createLog({
      organizationId,
      entityType: EntityType.CHANNEL,
      entityId: channel.id,
      action: ActionType.CREATE,
      templateKey: 'CHANNEL_CREATED',
      data: { title: channel.title },
    });
    return channel;
  }

  private async verifyChannelStatus(
    username: string,
    bot: Bot,
  ): Promise<ConnectionStatus> {
    try {
      const response = await this.getBotChatMember(username, bot);

      if (!response.ok || !response.result) {
        this.logger.warn(
          `Channel @${username} not found or bot is not a member`,
        );
        return ConnectionStatus.NOT_FOUND;
      }

      return this.determineConnectionStatus(response.result);
    } catch (error) {
      this.logger.error(
        `Error verifying channel status for @${username}`,
        error,
      );
      return ConnectionStatus.NOT_FOUND;
    }
  }

  private determineConnectionStatus(
    member: TelegramChatMemberAdministrator,
  ): ConnectionStatus {
    // Check if bot is admin or creator
    if (member.status !== 'administrator') {
      return ConnectionStatus.NOT_ADMIN;
    }

    // Check required permissions for administrators
    if (this.hasRequiredPermissions(member)) {
      return ConnectionStatus.DONE;
    }

    return ConnectionStatus.NO_REQUIRED_PERMISSIONS;
  }

  private hasRequiredPermissions(
    member: TelegramChatMemberAdministrator,
  ): boolean {
    return REQUIRED_PERMISSIONS.every(
      (permission) => member[permission] === true,
    );
  }

  private async getUserOrganizationId(userId: number): Promise<number> {
    const member = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });

    if (!member) {
      throw new NotFoundException('User is not a member of any organization');
    }

    return member.organizationId;
  }

  private async validateBotOwnership(
    botId: number,
    organizationId: number,
  ): Promise<Bot> {
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
    });

    if (!bot) {
      throw new NotFoundException(`Bot with ID ${botId} not found`);
    }

    if (bot.organizationId !== organizationId) {
      throw new ForbiddenException('Bot does not belong to your organization');
    }

    return bot;
  }

  private async getBotChatMember(
    username: string,
    bot: Bot,
  ): Promise<TelegramGetChatMemberResponse> {
    const decryptedToken = this.encryptionService.decrypt(bot.token);
    const url = this.buildTelegramApiUrl(decryptedToken, 'getChatMember', {
      chat_id: `@${username}`,
      user_id: bot.telegramId.toString(),
    });

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Telegram API request failed with status ${response.status}`,
      );
    }

    return response.json();
  }

  private async getChannelInfo(
    username: string,
    bot: Bot,
  ): Promise<TelegramChat> {
    const decryptedToken = this.encryptionService.decrypt(bot.token);
    const url = this.buildTelegramApiUrl(decryptedToken, 'getChat', {
      chat_id: `@${username}`,
    });

    const response = await fetch(url);
    if (!response.ok) {
      throw new NotFoundException(
        `Channel @${username} not found or bot (${bot.username}) cannot access it`,
      );
    }

    const data: TelegramGetChatResponse = await response.json();

    if (!data.ok || !data.result) {
      throw new BadRequestException(
        `Channel @${username} not found or bot cannot access it`,
      );
    }

    return data.result;
  }

  private buildTelegramApiUrl(
    token: string,
    method: string,
    params: Record<string, string>,
  ): string {
    const baseUrl = `https://api.telegram.org/bot${token}/${method}`;
    const queryString = new URLSearchParams(params).toString();
    return `${baseUrl}?${queryString}`;
  }

  private sanitizeUsername(username: string): string {
    // Remove @ if present at the start
    return username.startsWith('@') ? username.slice(1) : username;
  }

  async getChannels(
    userId: number,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<Channel>> {
    this.logger.log(`Fetching channels for user ${userId}`);

    const organizationId = await this.getUserOrganizationId(userId);

    const searchFilter = paginationDto.search
      ? {
          OR: [
            {
              title: {
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

    const [items, total] = await this.prisma.$transaction([
      this.prisma.channel.findMany({
        where: { organizationId, ...searchFilter },
        skip: paginationDto.skip,
        take: paginationDto.take,
        orderBy: { createdAt: paginationDto.order },
        include: {
          logo: {
            select: {
              id: true,
              key: true,
            },
          },
        },
      }),
      this.prisma.channel.count({
        where: { organizationId, ...searchFilter },
      }),
    ]);

    return new PaginatedResponseDto<Channel>(
      items,
      total,
      paginationDto.page ?? 1,
      paginationDto.limit ?? 20,
    );
  }

  async getChannelById(userId: number, channelId: number): Promise<Channel> {
    this.logger.log(`Fetching channel ${channelId} for user ${userId}`);

    const organizationId = await this.getUserOrganizationId(userId);

    const channel: any = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    if (channel.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Channel does not belong to your organization',
      );
    }

    return channel;
  }

  async updateChannel(
    userId: number,
    channelId: number,
    updateData: Partial<CreateChannelDto>,
  ): Promise<Channel> {
    this.logger.log(`Updating channel ${channelId} for user ${userId}`);

    const organizationId = await this.getUserOrganizationId(userId);
    const channel = await this.validateChannelOwnership(
      channelId,
      organizationId,
    );

    // If updating to public channel with username
    if (updateData.username) {
      const bot = await this.validateBotOwnership(
        updateData.botId!,
        organizationId,
      );
      const username = this.sanitizeUsername(updateData.username);
      const channelInfo = await this.getChannelInfo(username, bot);
      const status = await this.verifyChannelStatus(username, bot);

      const updated = await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          telegramId: channelInfo.id.toString(),
          title: channelInfo.title,
          username,
          status,
        },
      });
      await this.activityLogService.createLog({
        userId,
        organizationId,
        entityType: EntityType.CHANNEL,
        entityId: updated.id,
        action: ActionType.UPDATE,
        templateKey: 'CHANNEL_UPDATED',
        data: { title: updated.title },
      });
      return updated;
    }

    // If username is being updated for existing public channel
    if (updateData.username && channel.username !== updateData.username) {
      if (!updateData.botId) {
        throw new BadRequestException(
          'Bot ID is required to verify channel permissions',
        );
      }

      const bot = await this.validateBotOwnership(
        updateData.botId,
        organizationId,
      );
      const username = this.sanitizeUsername(updateData.username);
      const channelInfo = await this.getChannelInfo(username, bot);
      const status = await this.verifyChannelStatus(username, bot);

      const updated2 = await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          telegramId: channelInfo.id.toString(),
          title: channelInfo.title,
          username,
          status,
        },
      });
      await this.activityLogService.createLog({
        userId,
        organizationId,
        entityType: EntityType.CHANNEL,
        entityId: updated2.id,
        action: ActionType.UPDATE,
        templateKey: 'CHANNEL_UPDATED',
        data: { title: updated2.title },
      });
      return updated2;
    }

    // For other updates
    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: updateData,
    });
    await this.activityLogService.createLog({
      userId,
      organizationId,
      entityType: EntityType.CHANNEL,
      entityId: updated.id,
      action: ActionType.UPDATE,
      templateKey: 'CHANNEL_UPDATED',
      data: { title: updated.title },
    });
    return updated;
  }

  async deleteChannel(userId: number, channelId: number): Promise<void> {
    this.logger.log(`Deleting channel ${channelId} for user ${userId}`);

    const organizationId = await this.getUserOrganizationId(userId);
    const channel = await this.validateChannelOwnership(
      channelId,
      organizationId,
    );

    // Delete the channel
    await this.prisma.channel.delete({
      where: { id: channelId },
    });

    this.logger.log(`Channel ${channelId} deleted successfully`);
    await this.activityLogService.createLog({
      userId,
      organizationId,
      entityType: EntityType.CHANNEL,
      entityId: channelId,
      action: ActionType.DELETE,
      templateKey: 'CHANNEL_DELETED',
      data: { title: channel.title },
    });
  }

  async refreshChannelStatus(
    userId: number,
    channelId: number,
    botId: number,
  ): Promise<Channel> {
    this.logger.log(`Refreshing status for channel ${channelId}`);

    const organizationId = await this.getUserOrganizationId(userId);
    const channel = await this.validateChannelOwnership(
      channelId,
      organizationId,
    );
    const bot = await this.validateBotOwnership(botId, organizationId);

    if (!channel.username) {
      throw new BadRequestException(
        'Cannot refresh status for private channels',
      );
    }

    const oldStatus = channel.status;
    const status = await this.verifyChannelStatus(channel.username, bot);

    const updated = await this.prisma.channel.update({
      where: { id: channelId },
      data: { status },
    });
    if (oldStatus !== updated.status) {
      await this.activityLogService.createLog({
        userId,
        organizationId,
        entityType: EntityType.CHANNEL,
        entityId: updated.id,
        action: ActionType.STATUS_CHANGE,
        templateKey: 'CHANNEL_STATUS_CHANGED',
        data: { title: updated.title, oldStatus, newStatus: updated.status },
      });
    }
    return updated;
  }

  /**
   * Fetches channel logo from Telegram and saves it to database
   */
  private async fetchAndSaveChannelLogo(
    botToken: string,
    chatId: string,
    channelId: number,
    organizationId: number,
  ): Promise<void> {
    this.logger.log(
      `[START] Fetching channel logo for channelId=${channelId}, chatId=${chatId}, organizationId=${organizationId}`,
    );

    try {
      this.logger.log(
        `[STEP 1] Calling TelegramService.getChannelLogo() for channelId=${channelId}, chatId=${chatId}`,
      );
      const logoData = await this.telegramService.getChannelLogo(
        botToken,
        chatId,
        organizationId,
      );

      if (!logoData) {
        this.logger.warn(
          `[STEP 1 FAILED] No logo data returned from Telegram API for channelId=${channelId}, chatId=${chatId}`,
        );
        return;
      }

      this.logger.log(
        `[STEP 1 SUCCESS] Logo data received: size=${logoData.buffer.length} bytes, mimeType=${logoData.mimeType}, originalName=${logoData.originalName} for channelId=${channelId}`,
      );

      this.logger.log(
        `[STEP 2] Saving file to database using FileService for channelId=${channelId}`,
      );
      // Save logo using FileService
      const savedFile = await this.fileService.saveDownloadedFile(
        logoData.buffer,
        logoData.originalName,
        logoData.mimeType,
        organizationId,
      );

      this.logger.log(
        `[STEP 2 SUCCESS] File saved with fileId=${savedFile.id}, key=${savedFile.key} for channelId=${channelId}`,
      );

      this.logger.log(
        `[STEP 3] Updating channel record with logoId=${savedFile.id} for channelId=${channelId}`,
      );
      // Update channel with logoId
      const updatedChannel = await this.prisma.channel.update({
        where: { id: channelId },
        data: { logoId: savedFile.id },
      });

      this.logger.log(
        `[STEP 3 SUCCESS] Channel updated successfully: channelId=${updatedChannel.id}, logoId=${updatedChannel.logoId}`,
      );
      this.logger.log(
        `[COMPLETE] Channel logo saved successfully for channel ${channelId}`,
      );
    } catch (error) {
      this.logger.error(
        `[ERROR] Failed to fetch and save channel logo for channelId=${channelId}: ${error.message}`,
        error.stack,
      );
      this.logger.error(
        `[ERROR DETAILS] Error type: ${error.constructor.name}, ChatId: ${chatId}, OrganizationId: ${organizationId}`,
      );
      // Re-throw to see the error in the calling context
      throw error;
    }
  }

  private async validateChannelOwnership(
    channelId: number,
    organizationId: number,
  ): Promise<Channel> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    if (channel.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Channel does not belong to your organization',
      );
    }

    return channel;
  }
}
