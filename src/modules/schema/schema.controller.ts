import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { SchemaService } from './schema.service';
import {
  CreateSchemaDto,
  UpdateSchemaDto,
  CreateFieldDto,
  UpdateFieldDto,
  ReorderFieldsDto,
} from './dto';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import type { JwtPayload } from '@auth/strategies/jwt.strategy';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';

@ApiTags('Product Schema')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'product-schema', version: '1' })
export class SchemaController {
  constructor(private readonly schemaService: SchemaService) {}

  // Schema CRUD Operations

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create product schema for organization' })
  @ApiBody({ type: CreateSchemaDto })
  @ApiCreatedResponse({ description: 'Product schema created successfully' })
  @ApiConflictResponse({
    description: 'Organization already has a product schema',
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async createSchema(
    @CurrentUser() user: JwtPayload,
    @Body() createSchemaDto: CreateSchemaDto,
  ) {
    return this.schemaService.createSchema(
      Number(user.userId),
      createSchemaDto,
    );
  }

  @Get('')
  @ApiOperation({ summary: 'Get product schema by organization' })
  @ApiOkResponse({ description: 'Product schema with fields' })
  @ApiNotFoundResponse({
    description: 'Product schema not found for this organization',
  })
  async getSchemaByOrganization(@CurrentUser() user: JwtPayload) {
    return this.schemaService.getSchemaByOrganization(Number(user.userId));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product schema' })
  @ApiBody({ type: UpdateSchemaDto })
  @ApiOkResponse({ description: 'Product schema updated successfully' })
  @ApiNotFoundResponse({
    description: 'Schema not found or does not belong to organization',
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async updateSchema(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSchemaDto: UpdateSchemaDto,
  ) {
    return this.schemaService.updateSchema(
      id,
      Number(user.userId),
      updateSchemaDto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete product schema' })
  @ApiNoContentResponse({ description: 'Product schema deleted successfully' })
  @ApiNotFoundResponse({
    description: 'Schema not found or does not belong to organization',
  })
  @ApiConflictResponse({
    description: 'Cannot delete schema that has products',
  })
  async deleteSchema(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.schemaService.deleteSchema(id, Number(user.userId));
  }

  // Field Operations

  @Post(':id/fields')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add field to product schema' })
  @ApiBody({ type: CreateFieldDto })
  @ApiCreatedResponse({ description: 'Field added to schema successfully' })
  @ApiNotFoundResponse({
    description: 'Schema not found or does not belong to organization',
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async addField(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) schemaId: number,
    @Body() createFieldDto: CreateFieldDto,
  ) {
    return this.schemaService.addField(
      schemaId,
      Number(user.userId),
      createFieldDto,
    );
  }

  @Patch(':id/fields/reorder')
  @ApiOperation({ summary: 'Reorder fields in product schema' })
  @ApiBody({ type: ReorderFieldsDto })
  @ApiOkResponse({ description: 'Fields reordered successfully' })
  @ApiNotFoundResponse({
    description: 'Schema not found or does not belong to organization',
  })
  @ApiBadRequestResponse({
    description: 'Some fields do not belong to this schema',
  })
  async reorderFields(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) schemaId: number,
    @Body() reorderFieldsDto: ReorderFieldsDto,
  ) {
    return this.schemaService.reorderFields(
      schemaId,
      Number(user.userId),
      reorderFieldsDto,
    );
  }

  @Patch(':id/fields/:fieldId')
  @ApiOperation({ summary: 'Update field in product schema' })
  @ApiBody({ type: UpdateFieldDto })
  @ApiOkResponse({ description: 'Field updated successfully' })
  @ApiNotFoundResponse({
    description: 'Field not found or does not belong to this schema',
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async updateField(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) schemaId: number,
    @Param('fieldId', ParseIntPipe) fieldId: number,
    @Body() updateFieldDto: UpdateFieldDto,
  ) {
    return this.schemaService.updateField(
      schemaId,
      fieldId,
      Number(user.userId),
      updateFieldDto,
    );
  }

  @Delete(':id/fields/:fieldId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete field from product schema' })
  @ApiNoContentResponse({ description: 'Field deleted successfully' })
  @ApiNotFoundResponse({
    description: 'Field not found or does not belong to this schema',
  })
  @ApiConflictResponse({ description: 'Cannot delete field that has values' })
  async deleteField(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) schemaId: number,
    @Param('fieldId', ParseIntPipe) fieldId: number,
  ) {
    return this.schemaService.deleteField(
      schemaId,
      fieldId,
      Number(user.userId),
    );
  }
}
