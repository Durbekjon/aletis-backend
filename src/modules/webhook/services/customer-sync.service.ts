import { Injectable } from '@nestjs/common';
import { Customer } from '@prisma/client';
import { CustomersService } from '@modules/customers/customers.service';
import { WebhookDto } from '../dto/webhook.dto';

/**
 * Single-responsibility helper for the webhook flow: take a Telegram update
 * and return the matching Customer row, creating it on first contact.
 *
 * Pulled out of WebhookService so the upsert path is testable in isolation
 * and so WebhookService no longer has to know how to assemble a "first_name
 * last_name" display name.
 */
@Injectable()
export class CustomerSyncService {
  constructor(private readonly customersService: CustomersService) {}

  async findOrCreateFromUpdate(
    webhookData: WebhookDto,
    botId: number,
    organizationId: number,
  ): Promise<Customer | null> {
    const client = webhookData.message?.from;
    if (!client) {
      return null;
    }
    const telegramId = client.id.toString();

    const existing = await this.customersService._getCustomerByTelegramId(
      telegramId,
      organizationId,
      botId,
    );
    if (existing) return existing;

    return this.customersService.createCustomer({
      telegramId,
      organizationId,
      botId,
      name: this.buildDisplayName(client),
      username: client.username || null,
    });
  }

  private buildDisplayName(client: {
    first_name?: string | null;
    last_name?: string | null;
  }): string {
    const first = client.first_name?.trim() ?? '';
    const last = client.last_name?.trim() ?? '';
    return [first, last].filter(Boolean).join(' ') || 'Unknown';
  }
}
