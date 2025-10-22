import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { Prisma, PostStatus } from '@prisma/client';
import { PrismaService } from '@core/prisma/prisma.service';
import { EncryptionService } from '@core/encryption/encryption.service';
import { TelegramService } from '@telegram/telegram.service';
import { PaginationDto, PaginatedResponseDto } from '@/shared/dto';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly telegram: TelegramService,
    private readonly configService: ConfigService,
  ) {}

  private async getUserOrganizationId(userId: number): Promise<number> {
    const member = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });
    if (!member)
      throw new ForbiddenException('User is not a member of any organization');
    return member.organizationId;
  }

  private async ensureOwnershipByIds(
    organizationId: number,
    productId: number,
    channelId: number,
  ) {
    const [product, channel] = await this.prisma.$transaction([
      this.prisma.product.findUnique({ where: { id: productId } }),
      this.prisma.channel.findUnique({ where: { id: channelId } }),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    if (!channel) throw new NotFoundException('Channel not found');
    if (product.organizationId !== organizationId)
      throw new ForbiddenException('Product out of organization');
    if (channel.organizationId !== organizationId)
      throw new ForbiddenException('Channel out of organization');
    return { product, channel };
  }

  async createPost(userId: number, dto: CreatePostDto) {
    const organizationId = await this.getUserOrganizationId(userId);
    await this.ensureOwnershipByIds(
      organizationId,
      dto.productId,
      dto.channelId,
    );

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
    const status: PostStatus =
      dto.status ?? (scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT);

    const post = await this.prisma.post.create({
      data: {
        productId: dto.productId,
        channelId: dto.channelId,
        content: dto.content,
        status,
        scheduledAt,
      },
    });
    if (status === PostStatus.SCHEDULED && scheduledAt) {
      await this.schedulePost(userId, post.id, scheduledAt.toISOString());
    } else if (status === PostStatus.SENT) {
      await this.sendPostToTelegram(post.id);
    }
    return post;
  }

  async updatePost(userId: number, postId: number, dto: UpdatePostDto) {
    const organizationId = await this.getUserOrganizationId(userId);
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { channel: true, product: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (
      post.channel.organizationId !== organizationId ||
      post.product.organizationId !== organizationId
    )
      throw new ForbiddenException('Post out of organization');

    const scheduledAt = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : post.scheduledAt;

    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: {
        content: dto.content ?? post.content,
        status: dto.status ?? post.status,
        scheduledAt,
      },
    });
    return updated;
  }

  async deletePost(userId: number, postId: number) {
    const organizationId = await this.getUserOrganizationId(userId);
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { channel: { include: { connectedBot: true } } },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (!post.channel || post.channel.organizationId !== organizationId)
      throw new ForbiddenException('Post out of organization');

    // If already sent, try deleting from Telegram
    if (post.telegramId && post.channel.connectedBot) {
      try {
        const token = this.encryption.decrypt(post.channel.connectedBot.token);
        await this.telegram.sendRequest(token, 'deleteMessage', {
          chat_id: post.channel.telegramId,
          message_id: Number(post.telegramId),
        });
      } catch (err) {
        this.logger.warn(
          `Failed to delete Telegram message for post ${postId}: ${err?.message}`,
        );
      }
    }

    await this.prisma.post.delete({ where: { id: postId } });
    return { success: true };
  }

  async getPosts(
    userId: number,
    pagination: PaginationDto,
    channelId?: number,
  ) {
    const organizationId = await this.getUserOrganizationId(userId);
    let whereClause: Prisma.PostWhereInput = {};
    if (channelId) {
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
      });
      if (!channel) throw new NotFoundException('Channel not found');
      if (channel.organizationId !== organizationId)
        throw new ForbiddenException('Channel out of organization');
      whereClause.channelId = channelId;
    }

    if (pagination.search) {
      whereClause = {
        ...whereClause,
        content: {
          contains: pagination.search,
          mode: Prisma.QueryMode.insensitive,
        },
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where: whereClause,
        include: {
          channel: {
            select: {
              id: true,
              title: true,
              username: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              currency: true,
              price: true,
              images: {
                select: {
                  id: true,
                  key: true,
                  originalName: true,
                },
              },
            },
          },
        },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: pagination.order },
      }),
      this.prisma.post.count({ where: whereClause }),
    ]);

    return new PaginatedResponseDto(
      items,
      total,
      pagination.page ?? 1,
      pagination.limit ?? 20,
    );
  }

  async getPostById(userId: number, postId: number) {
    const organizationId = await this.getUserOrganizationId(userId);
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        channel: {
          select: {
            id: true,
            title: true,
            username: true,
            organizationId: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            currency: true,
            price: true,
            organizationId: true,
            images: { select: { id: true, key: true, originalName: true } },
          },
        },
      },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (
      !post.channel ||
      !post.product ||
      post.channel.organizationId !== organizationId ||
      post.product.organizationId !== organizationId
    )
      throw new ForbiddenException('Post out of organization');

    // Strip organizationId from response objects
    const { organizationId: _cOrg, ...channel } = post.channel as any;
    const { organizationId: _pOrg, ...product } = post.product as any;
    return { ...post, channel, product };
  }

  async schedulePost(userId: number, postId: number, scheduledAtISO: string) {
    const organizationId = await this.getUserOrganizationId(userId);
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { channel: true, product: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (
      post.channel.organizationId !== organizationId ||
      post.product.organizationId !== organizationId
    )
      throw new ForbiddenException('Post out of organization');

    const scheduledAt = new Date(scheduledAtISO);
    if (Number.isNaN(scheduledAt.getTime()))
      throw new BadRequestException('Invalid schedule date');

    return this.prisma.post.update({
      where: { id: postId },
      data: { scheduledAt, status: PostStatus.SCHEDULED },
    });
  }

  // Utilities for sending/editing messages
  async sendPostToTelegram(postId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        channel: { include: { connectedBot: true } },
        product: { include: { images: true } },
      },
    });

    if (!post) throw new NotFoundException('Post not found');
    if (!post.channel?.connectedBotId)
      throw new BadRequestException('Channel has no connected bot');

    const connectedBot = await this.prisma.bot.findUnique({
      where: { id: post.channel.connectedBotId },
    });
    if (!connectedBot) throw new BadRequestException('Connected bot not found');

    const token = this.encryption.decrypt(connectedBot.token);
    const images = post.product.images || [];
    const baseUrl = this.configService.get<string>('PUBLIC_BASE_URL') || '';
    const botLink = `<a href="https://t.me/${connectedBot.username}?start=post_${postId}">More Info</a>`;

    let telegramId: string | null = null;
    let meta: any = {};

    const caption = `${post.content}\n\n👉 ${botLink}`;

    if (images.length > 1) {
      const media = images.slice(0, 10).map((img, idx) => ({
        type: 'photo',
        media: `${baseUrl}/${img.key}`.replace(/\\/g, '/'),
        caption: idx === 0 ? caption : undefined,
        parse_mode: 'HTML',
      }));

      const res = await this.telegram.sendRequest(token, 'sendMediaGroup', {
        chat_id: post.channel.telegramId,
        media,
      });

      if (!res.ok) {
        if (res.error_code === 403) {
          throw new ForbiddenException(
            'Bot is not a member of the channel. Please add the bot to the channel first.',
          );
        }
        throw new ForbiddenException(
          `Failed to send media group to Telegram: ${res.description || 'Unknown error'}`,
        );
      }

      const first = Array.isArray(res.result) ? res.result[0] : undefined;
      telegramId = first?.message_id ? String(first.message_id) : null;
      meta = res.result;
    } else if (images.length === 1) {
      const res = await this.telegram.sendRequest(token, 'sendPhoto', {
        chat_id: post.channel.telegramId,
        photo: `${baseUrl}/${images[0].key}`.replace(/\\/g, '/'),
        caption,
        parse_mode: 'HTML',
      });

      if (!res.ok) {
        if (res.error_code === 403) {
          throw new ForbiddenException(
            'Bot is not a member of the channel. Please add the bot to the channel first.',
          );
        }
        throw new ForbiddenException(
          `Failed to send photo to Telegram: ${res.description || 'Unknown error'}`,
        );
      }

      telegramId = String(res.result?.message_id ?? res.message_id ?? '');
      meta = res.result ?? res;
    } else {
      const res = await this.telegram.sendRequest(token, 'sendMessage', {
        chat_id: post.channel.telegramId,
        text: caption,
        parse_mode: 'HTML',
      });

      if (!res.ok) {
        if (res.error_code === 403) {
          throw new ForbiddenException(
            'Bot is not a member of the channel. Please add the bot to the channel first.',
          );
        }
        throw new ForbiddenException(
          `Failed to send message to Telegram: ${res.description || 'Unknown error'}`,
        );
      }

      telegramId = String(res.result?.message_id ?? res.message_id ?? '');
      meta = res.result ?? res;
    }

    const now = new Date();
    return this.prisma.post.update({
      where: { id: post.id },
      data: {
        telegramId: telegramId ?? undefined,
        metaData: meta as unknown as Prisma.InputJsonValue,
        status: PostStatus.SENT,
        sentAt: now,
      },
    });
  }

  async editPostOnTelegram(postId: number) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { channel: { include: { connectedBot: true } } },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (!post.telegramId) return post; // Not sent yet
    if (!post.channel?.connectedBot)
      throw new BadRequestException('Channel has no connected bot');

    const token = this.encryption.decrypt(post.channel.connectedBot.token);
    try {
      const res = await this.telegram.sendRequest(token, 'editMessageCaption', {
        chat_id: post.channel.telegramId,
        message_id: Number(post.telegramId),
        caption: post.content,
        parse_mode: 'HTML',
      });

      if (!res.ok) {
        if (res.error_code === 403) {
          throw new ForbiddenException(
            'Bot is not a member of the channel. Please add the bot to the channel first.',
          );
        }
        throw new ForbiddenException(
          `Failed to edit message caption: ${res.description || 'Unknown error'}`,
        );
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      // fallback to editMessageText for text-only posts
      try {
        const res = await this.telegram.sendRequest(token, 'editMessageText', {
          chat_id: post.channel.telegramId,
          message_id: Number(post.telegramId),
          text: post.content,
          parse_mode: 'HTML',
        });

        if (!res.ok) {
          if (res.error_code === 403) {
            throw new ForbiddenException(
              'Bot is not a member of the channel. Please add the bot to the channel first.',
            );
          }
          throw new ForbiddenException(
            `Failed to edit message text: ${res.description || 'Unknown error'}`,
          );
        }
      } catch (fallbackError) {
        if (fallbackError instanceof ForbiddenException) {
          throw fallbackError;
        }
        throw new ForbiddenException('Failed to edit message on Telegram');
      }
    }

    return post;
  }
}


