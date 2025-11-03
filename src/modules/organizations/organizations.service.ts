import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { FileDeleteService } from '@/core/file-delete/file-delete.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import {
  Organization,
  MemberRole,
  MemberStatus,
  OnboardingStatus,
  OnboardingStep,
} from '@prisma/client';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileDeleteService: FileDeleteService,
  ) {}

  async createOrganization(
    userId: number,
    dto: CreateOrganizationDto,
  ): Promise<Organization> {
    // 1. Ensure the user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { member: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // 2. Ensure user is not already a member of any organization
    if (user.member) {
      throw new BadRequestException(
        'User is already associated with an organization',
      );
    }

    // 3. Create organization and member in a single transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          category: dto.category ?? undefined,
          onboardingProgress: {
            create: {
              percentage: 20,
              status: OnboardingStatus.INCOMPLETE,
              nextStep: dto.category
                ? OnboardingStep.SELECT_CATEGORY
                : OnboardingStep.CONFIGURE_SCHEMA,
            },
          },
        },
      });
      await tx.member.create({
        data: {
          userId,
          organizationId: organization.id,
          role: 'ADMIN' as MemberRole,
          status: 'ACTIVE' as MemberStatus,
        },
      });
      return tx.organization.findUnique({
        where: { id: organization.id },
        include: { onboardingProgress: true },
      });
    });
    return result!;
  }

  async getMyOrganization(userId: number): Promise<Organization> {
    const organizations = await this.prisma.organization.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
      include: { 
        logo: true,
       },
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

    // Get current organization with logo
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: { logo: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Handle logo update: delete old logo if a new one is provided or if logoId is null
    let oldLogoKey: string | null = null;
    if (dto.logoId !== undefined) {
      // If there's an old logo, get its key for deletion
      if (organization.logoId && organization.logo) {
        oldLogoKey = organization.logo.key;
      }

      // If a new logoId is provided, validate it exists
      if (dto.logoId !== null) {
        const newLogo = await this.prisma.file.findUnique({
          where: { id: dto.logoId },
        });
        if (!newLogo) {
          throw new BadRequestException('Logo file not found');
        }
      }
    }

    // Update organization with new data
    const updatedOrganization = await this.prisma.organization.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        category: dto.category ?? undefined,
        logoId: dto.logoId ?? undefined,
      },
    });

    // Delete old logo file from filesystem if it was replaced
    if (oldLogoKey && dto.logoId !== organization.logoId) {
      try {
        await this.fileDeleteService.deleteFileByKey(oldLogoKey);
        // Delete the old logo file record from database
        if (organization.logoId) {
          await this.prisma.file.delete({
            where: { id: organization.logoId },
          }).catch((error) => {
            this.logger.warn(
              `Failed to delete old logo file record: ${error.message}`,
            );
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to delete old logo file: ${error.message}`,
        );
        // Don't throw error - logo update succeeded even if old file deletion failed
      }
    }

    return updatedOrganization;
  }

  async deleteOrganization(userId: number, id: number): Promise<Organization> {
    await this.ensureAdmin(userId, id);
    return this.prisma.organization.delete({ where: { id } });
  }
}
