import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@core/prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { Customer, MemberRole, Message, Organization, Prisma } from '@prisma/client';
import { PaginatedResponseDto, PaginationDto } from '@/shared/dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async getCustomers(
    userId: number,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResponseDto<Customer>> {
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
    const [customers, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where: { organizationId: organization.id, ...searchFilter },
        skip: paginationDto.skip,
        take: paginationDto.take,
        orderBy: { createdAt: paginationDto.order },
      }),
      this.prisma.customer.count({
        where: { organizationId: organization.id, ...searchFilter },
      }),
    ]);
    return new PaginatedResponseDto<Customer>(
      customers,
      total,
      paginationDto.page ?? 1,
      paginationDto.limit ?? 20,
    );
  }

  async getCustomerDetails(
    userId: number,
    id: number,
  ): Promise<Customer | null> {
    const organization = await this.validateUser(userId);
    const customer = await this.prisma.customer.findUnique({
      where: { id, organizationId: organization.id },
    });
    return customer;
  }

  async createCustomer(
    createCustomerDto: CreateCustomerDto,
  ): Promise<Customer> {
    const customer = await this.prisma.customer.findUnique({
      where: {
        telegramId_organizationId_botId: {
          telegramId: createCustomerDto.telegramId,
          organizationId: createCustomerDto.organizationId,
          botId: createCustomerDto.botId,
        },
      },
    });
    if (customer) return customer;
    return this.prisma.customer.create({
      data: {
        ...createCustomerDto,
        organizationId: createCustomerDto.organizationId,
        botId: createCustomerDto.botId,
      },
      include: {
        organization: true,
        bot: true,
      },
    });
  }

  // keep only the org-scoped version used by controller

  async _getCustomerByTelegramId(
    telegramId: string,
    organizationId: number,
    botId: number,
  ): Promise<Customer | null> {
    const customer = await this.prisma.customer.findUnique({
      where: {
        telegramId_organizationId_botId: {
          telegramId,
          organizationId,
          botId,
        },
      },
      include: {
        bot: true,
      },
    });
    if (!customer) return null;
    return customer;
  }

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
