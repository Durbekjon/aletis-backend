import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '@auth/guards/platform-admin.guard';
import { CategoriesService } from './categories.service';
import {
  AdminCategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto';

@ApiTags('Admin · Categories')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller({ path: 'admin/categories', version: '1' })
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'List all categories (admin view, includes archived by default)',
  })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    description:
      'Set to false to hide archived categories. Defaults to true so admins see the full inventory.',
  })
  @ApiOkResponse({ type: AdminCategoryDto, isArray: true })
  list(
    @Query('includeArchived', new ParseBoolPipe({ optional: true }))
    includeArchived?: boolean,
  ): Promise<AdminCategoryDto[]> {
    return this.categoriesService.listAll(includeArchived ?? true);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a category',
    description:
      'Derives depth + path from the parent. If `isLeaf` is true, an empty CategorySchema is created so the resolved-schema lookup returns [] instead of 404.',
  })
  @ApiBody({ type: CreateCategoryDto })
  @ApiOkResponse({ type: AdminCategoryDto })
  create(@Body() dto: CreateCategoryDto): Promise<AdminCategoryDto> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update labels / iconKey',
    description:
      'Slug, parentId, and isLeaf are write-once. Restructure the tree via archive + recreate.',
  })
  @ApiBody({ type: UpdateCategoryDto })
  @ApiOkResponse({ type: AdminCategoryDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ): Promise<AdminCategoryDto> {
    return this.categoriesService.update(id, dto);
  }

  @Post(':id/archive')
  @ApiOperation({
    summary: 'Archive a category (soft-hide from buyers)',
    description:
      'Refuses when the category has active descendants or live products. Archive bottom-up.',
  })
  @ApiOkResponse({ type: AdminCategoryDto })
  archive(@Param('id', ParseIntPipe) id: number): Promise<AdminCategoryDto> {
    return this.categoriesService.archive(id);
  }

  @Post(':id/restore')
  @ApiOperation({
    summary: 'Restore an archived category',
    description:
      "Refuses if the parent is still archived — restore top-down so the buyer tree stays consistent.",
  })
  @ApiOkResponse({ type: AdminCategoryDto })
  restore(@Param('id', ParseIntPipe) id: number): Promise<AdminCategoryDto> {
    return this.categoriesService.restore(id);
  }
}
