import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import { PostsService } from './posts.service';
import { PostStatus } from '@prisma/client';

@Injectable()
export class PostsScheduler {
  private readonly logger = new Logger(PostsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly postsService: PostsService,
  ) {
    // Poll every 30 seconds
    setInterval(() => this.processScheduledPosts().catch(() => undefined), 30_000);
  }

  private async processScheduledPosts(): Promise<void> {
    const now = new Date();

    const scheduled = await this.prisma.post.findMany({
      where: {
        status: PostStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      take: 20,
      orderBy: { scheduledAt: 'asc' },
    });

    for (const post of scheduled) {
      try {
        // Skip if deleted right before send (defensive; findMany already ensures existence)
        await this.postsService.sendPostToTelegram(post.id);
      } catch (err) {
        this.logger.error(`Failed to send scheduled post ${post.id}: ${err?.message}`);
        await this.prisma.post.update({
          where: { id: post.id },
          data: { status: PostStatus.FAILED, failLog: err?.message?.toString().slice(0, 1000) },
        });
      }
    }
  }
}


