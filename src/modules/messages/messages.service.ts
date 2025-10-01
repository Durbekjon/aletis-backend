import { PrismaService } from '@core/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Message } from '@prisma/client';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async _getCustomerLastMessages(
    customerId: number,
    limit: number = 10,
  ): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async _saveMessage(
    customerId: number,
    content: string,
    sender: 'USER' | 'BOT',
  ): Promise<Message> {
    return this.prisma.message.create({
      data: { customerId, content, sender }
    });
  }
}
