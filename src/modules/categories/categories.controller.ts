import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import {
  CategoryTreeNodeDto,
  ResolvedCategorySchemaDto,
} from './dto';

@ApiTags('Categories')
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('tree')
  @ApiOperation({ summary: 'Get the full category tree' })
  @ApiOkResponse({ type: CategoryTreeNodeDto, isArray: true })
  async getTree(): Promise<CategoryTreeNodeDto[]> {
    return this.categoriesService.getTree();
  }

  @Get('search')
  @ApiOperation({ summary: 'Search categories by name or slug' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiOkResponse({ type: CategoryTreeNodeDto, isArray: true })
  async search(
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ): Promise<CategoryTreeNodeDto[]> {
    return this.categoriesService.search(q ?? '', limit ? Number(limit) : 20);
  }

  @Get(':id/children')
  @ApiOperation({ summary: "Get a category's direct children" })
  @ApiOkResponse({ type: CategoryTreeNodeDto, isArray: true })
  async getChildren(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CategoryTreeNodeDto[]> {
    return this.categoriesService.getChildren(id);
  }

  @Get(':id/schema')
  @ApiOperation({
    summary:
      "Get the resolved (inheritance-flattened) product schema for a leaf category",
  })
  @ApiOkResponse({ type: ResolvedCategorySchemaDto })
  async getSchema(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ResolvedCategorySchemaDto> {
    return this.categoriesService.getResolvedSchema(id);
  }
}
