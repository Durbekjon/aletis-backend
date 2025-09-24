import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import type { Organization, MemberRole, MemberStatus } from '@prisma/client';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrganization(
    userId: number,
    dto: CreateOrganizationDto,
  ): Promise<Organization> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { member: true },
    });
    if (user?.member) {
      throw new BadRequestException('Organization is allready exist');
    }
    const organization = await this.prisma.organization.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        members: {
          create: {
            userId,
            role: 'ADMIN' as MemberRole,
            status: 'ACTIVE' as MemberStatus,
          },
        },
      },
    });
    return organization;
  }

  async getMyOrganization(userId: number): Promise<Organization> {
    const organizations = await this.prisma.organization.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!organizations || organizations.length !== 1) {
      throw new NotFoundException('Organization not found');
    }
    return organizations[0];
  }

  async getOrganizationById(userId: number, id: number) {
    const org = await this.prisma.organization.findFirst({
      where: { id, members: { some: { userId } } },
      include: {
        members: { include: { user: true } },
        bots: true,
        products: true,
        orders: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  private async ensureAdmin(userId: number, organizationId: number) {
    const membership = await this.prisma.member.findFirst({
      where: { organizationId, userId },
      select: { role: true },
    });
    if (!membership || membership.role !== 'ADMIN') {
      throw new ForbiddenException('Admin permission required');
    }
  }

  async updateOrganization(
    userId: number,
    id: number,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    await this.ensureAdmin(userId, id);
    return this.prisma.organization.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
      },
    });
  }

  async deleteOrganization(userId: number, id: number): Promise<Organization> {
    await this.ensureAdmin(userId, id);
    // soft delete strategy can be implemented with an `isDeleted` flag; for now, hard delete
    return this.prisma.organization.delete({ where: { id } });
  }
}
