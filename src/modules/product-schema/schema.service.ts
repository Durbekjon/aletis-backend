import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ActionType, EntityType } from '@prisma/client';
import {
  CreateSchemaDto,
  UpdateSchemaDto,
  CreateFieldDto,
  UpdateFieldDto,
  ReorderFieldsDto,
} from './dto';
@Injectable()
export class SchemaService {
  constructor(
    private prisma: PrismaService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async createSchema(userId: number, createSchemaDto: CreateSchemaDto) {
    const organization = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Check if organization already has a schema
    const existingSchema = await this.prisma.productSchema.findUnique({
      where: { organizationId: organization.organizationId },
    });

    if (existingSchema) {
      throw new ConflictException('Organization already has a product schema');
    }

    const created = await this.prisma.productSchema.create({
      data: {
        ...createSchemaDto,
        organization: {
          connect: {
            id: organization.organizationId,
          },
        },
      },
      include: {
        fields: {
          orderBy: { order: 'asc' },
        },
      },
    });

    await this.activityLogService.createLog({
      userId,
      organizationId: organization.organizationId,
      entityType: EntityType.PRODUCT,
      entityId: created.id,
      action: ActionType.CREATE,
      templateKey: 'SCHEMA_CREATED',
      data: { name: created.name },
    });

    return created;
  }

  async getSchemaByOrganization(userId: number) {
    const organization = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const schema = await this.prisma.productSchema.findUnique({
      where: { organizationId: organization.organizationId },
      include: {
        fields: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!schema) {
      throw new NotFoundException(
        'Product schema not found for this organization',
      );
    }

    return schema;
  }

  async updateSchema(
    schemaId: number,
    userId: number,
    updateSchemaDto: UpdateSchemaDto,
  ) {
    const organization = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Verify ownership
    const schema = await this.prisma.productSchema.findFirst({
      where: { id: schemaId, organizationId: organization.organizationId },
    });

    if (!schema) {
      throw new NotFoundException(
        'Schema not found or does not belong to organization',
      );
    }

    const updated = await this.prisma.productSchema.update({
      where: { id: schemaId },
      data: updateSchemaDto,
      include: {
        fields: {
          orderBy: { order: 'asc' },
        },
      },
    });
    await this.activityLogService.createLog({
      userId,
      organizationId: organization.organizationId,
      entityType: EntityType.PRODUCT,
      entityId: updated.id,
      action: ActionType.UPDATE,
      templateKey: 'SCHEMA_UPDATED',
      data: { name: updated.name },
    });
    return updated;
  }

  async deleteSchema(schemaId: number, userId: number) {
    const organization = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Verify ownership
    const schema = await this.prisma.productSchema.findFirst({
      where: { id: schemaId, organizationId: organization.organizationId },
      include: {
        products: true,
      },
    });

    if (!schema) {
      throw new NotFoundException(
        'Schema not found or does not belong to organization',
      );
    }

    // Check if there are products using this schema
    if (schema.products.length > 0) {
      throw new ConflictException(
        'Cannot delete schema that has products. Delete products first or use cascade delete.',
      );
    }

    const deleted = await this.prisma.productSchema.delete({
      where: { id: schemaId },
    });
    await this.activityLogService.createLog({
      userId,
      organizationId: organization.organizationId,
      entityType: EntityType.PRODUCT,
      entityId: deleted.id,
      action: ActionType.DELETE,
      templateKey: 'SCHEMA_DELETED',
      data: { name: deleted.name },
    });
    return deleted;
  }

  // Field Operations

  async addField(
    schemaId: number,
    userId: number,
    createFieldDto: CreateFieldDto,
  ) {
    const organization = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Verify schema ownership
    const schema = await this.prisma.productSchema.findFirst({
      where: { id: schemaId, organizationId: organization.organizationId },
    });

    if (!schema) {
      throw new NotFoundException(
        'Schema not found or does not belong to organization',
      );
    }

    // Get the next order number
    const lastField = await this.prisma.field.findFirst({
      where: { schemaId },
      orderBy: { order: 'desc' },
    });

    const nextOrder = lastField ? lastField.order + 1 : 0;

    return this.prisma.field.create({
      data: {
        ...createFieldDto,
        schemaId,
        order: createFieldDto.order ?? nextOrder,
      },
    });
  }

  async updateField(
    schemaId: number,
    fieldId: number,
    userId: number,
    updateFieldDto: UpdateFieldDto,
  ) {
    const organization = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Verify field belongs to schema and organization
    const field = await this.prisma.field.findFirst({
      where: {
        id: fieldId,
        schema: {
          id: schemaId,
          organizationId: organization.organizationId,
        },
      },
    });

    if (!field) {
      throw new NotFoundException(
        'Field not found or does not belong to this schema',
      );
    }

    return this.prisma.field.update({
      where: { id: fieldId },
      data: updateFieldDto,
    });
  }

  async deleteField(
    schemaId: number,
    fieldId: number,
    userId: number,
    force: boolean = false,
  ) {
    const organization = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Verify field belongs to schema and organization
    const field = await this.prisma.field.findFirst({
      where: {
        id: fieldId,
        schema: {
          id: schemaId,
          organizationId: organization.organizationId,
        },
      },
      include: {
        fieldValues: true,
      },
    });

    if (!field) {
      throw new NotFoundException(
        'Field not found or does not belong to this schema',
      );
    }

    // Check if field has values (products using this field)
    if (field.fieldValues.length > 0 && !force) {
      throw new ConflictException(
        'Cannot delete field that has values. Pass force=true to cascade delete values.',
      );
    }

    // If forcing, delete field values first to avoid constraint errors, then delete the field
    if (field.fieldValues.length > 0 && force) {
      await this.prisma.$transaction([
        this.prisma.fieldValue.deleteMany({ where: { fieldId } }),
        this.prisma.field.delete({ where: { id: fieldId } }),
      ]);
      return;
    }

    return this.prisma.field.delete({ where: { id: fieldId } });
  }

  async reorderFields(
    schemaId: number,
    userId: number,
    reorderFieldsDto: ReorderFieldsDto,
  ) {
    const organization = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Verify schema ownership
    const schema = await this.prisma.productSchema.findFirst({
      where: { id: schemaId, organizationId: organization.organizationId },
    });

    if (!schema) {
      throw new NotFoundException(
        'Schema not found or does not belong to organization',
      );
    }

    // Verify all fields belong to this schema
    const fieldIds = reorderFieldsDto.fields.map((f) => f.fieldId);
    const fields = await this.prisma.field.findMany({
      where: {
        id: { in: fieldIds },
        schemaId,
      },
    });

    if (fields.length !== fieldIds.length) {
      throw new BadRequestException('Some fields do not belong to this schema');
    }

    // Update field orders in a transaction
    return this.prisma.$transaction(
      reorderFieldsDto.fields.map((fieldOrder) =>
        this.prisma.field.update({
          where: { id: fieldOrder.fieldId },
          data: { order: fieldOrder.order },
        }),
      ),
    );
  }

  // Helper method to get schema with fields ordered
  async getSchemaWithFields(schemaId: number, userId: number) {
    const organization = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const schema = await this.prisma.productSchema.findFirst({
      where: { id: schemaId, organizationId: organization.organizationId },
      include: {
        fields: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!schema) {
      throw new NotFoundException(
        'Schema not found or does not belong to organization',
      );
    }

    return schema;
  }
}
