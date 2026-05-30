import { CustomerSyncService } from './customer-sync.service';
import { CustomersService } from '@modules/customers/customers.service';
import { WebhookDto } from '../dto/webhook.dto';

function makeCustomersMock() {
  return {
    _getCustomerByTelegramId: jest.fn(),
    createCustomer: jest.fn(),
  };
}

function buildUpdate(
  from: Partial<{
    id: number;
    first_name: string;
    last_name: string | null;
    username: string | null;
  }>,
): WebhookDto {
  return {
    update_id: 1,
    message: { from },
  } as unknown as WebhookDto;
}

describe('CustomerSyncService', () => {
  let customers: ReturnType<typeof makeCustomersMock>;
  let service: CustomerSyncService;

  beforeEach(() => {
    customers = makeCustomersMock();
    service = new CustomerSyncService(customers as unknown as CustomersService);
  });

  it('returns null when the update has no message.from', async () => {
    const result = await service.findOrCreateFromUpdate(
      { update_id: 1 } as unknown as WebhookDto,
      1,
      1,
    );
    expect(result).toBeNull();
    expect(customers._getCustomerByTelegramId).not.toHaveBeenCalled();
  });

  it('returns the existing customer when one already matches', async () => {
    const existing = { id: 42 };
    customers._getCustomerByTelegramId.mockResolvedValue(existing);

    const result = await service.findOrCreateFromUpdate(
      buildUpdate({ id: 7, first_name: 'Alice' }),
      1,
      99,
    );

    expect(result).toBe(existing);
    expect(customers.createCustomer).not.toHaveBeenCalled();
    expect(customers._getCustomerByTelegramId).toHaveBeenCalledWith('7', 99, 1);
  });

  it('creates a customer with a "first last" display name on first contact', async () => {
    customers._getCustomerByTelegramId.mockResolvedValue(null);
    const created = { id: 100, name: 'Alice Doe' };
    customers.createCustomer.mockResolvedValue(created);

    const result = await service.findOrCreateFromUpdate(
      buildUpdate({
        id: 7,
        first_name: 'Alice',
        last_name: 'Doe',
        username: 'alice',
      }),
      1,
      99,
    );

    expect(result).toBe(created);
    expect(customers.createCustomer).toHaveBeenCalledWith({
      telegramId: '7',
      organizationId: 99,
      botId: 1,
      name: 'Alice Doe',
      username: 'alice',
    });
  });

  it('falls back to first name only when last name is missing', async () => {
    customers._getCustomerByTelegramId.mockResolvedValue(null);
    customers.createCustomer.mockResolvedValue({ id: 1 });

    await service.findOrCreateFromUpdate(
      buildUpdate({ id: 7, first_name: 'Alice', last_name: null }),
      1,
      99,
    );

    expect(customers.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alice', username: null }),
    );
  });

  it('uses "Unknown" when neither first nor last name is present', async () => {
    customers._getCustomerByTelegramId.mockResolvedValue(null);
    customers.createCustomer.mockResolvedValue({ id: 1 });

    await service.findOrCreateFromUpdate(buildUpdate({ id: 7 }), 1, 99);

    expect(customers.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Unknown' }),
    );
  });
});
