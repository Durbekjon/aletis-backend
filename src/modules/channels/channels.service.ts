import { PrismaService } from '@core/prisma/prisma.service';
import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import type { Channel } from '@prisma/client';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getChannelsForUser(userId: number): Promise<Channel[]> {
    return this.prisma.channel.findMany({
      where: {
        ownerId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async connectChannel(
    userId: number,
    channelId: bigint,
    channelTitle: string,
  ): Promise<Channel> {
    this.logger.log(
      `Connecting channel ${channelId} (${channelTitle}) to user ${userId}`,
    );

    // Check if channel is already connected to any user
    const existingChannel = await this.prisma.channel.findUnique({
      where: {
        telegramId: channelId,
      },
    });

    if (existingChannel) {
      if (existingChannel.ownerId === userId) {
        this.logger.log(
          `Channel ${channelId} is already connected to user ${userId}`,
        );
        return existingChannel;
      } else {
        throw new ConflictException(
          'Channel is already connected to another user',
        );
      }
    }

    // Create new channel connection
    const channel = await this.prisma.channel.create({
      data: {
        telegramId: channelId,
        title: channelTitle,
        ownerId: userId,
      },
    });

    this.logger.log(
      `Successfully connected channel ${channelId} to user ${userId}`,
    );
    return channel;
  }

  async disconnectChannel(userId: number, channelId: number): Promise<void> {
    this.logger.log(`Disconnecting channel ${channelId} from user ${userId}`);

    // Find the channel and verify ownership
    const channel = await this.prisma.channel.findUnique({
      where: {
        id: channelId,
      },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.ownerId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to disconnect this channel',
      );
    }

    // Delete the channel
    await this.prisma.channel.delete({
      where: {
        id: channelId,
      },
    });

    this.logger.log(
      `Successfully disconnected channel ${channelId} from user ${userId}`,
    );
  }
}
