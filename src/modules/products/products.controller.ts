import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
  ProductPaginatedResponseDto,
  BulkDeleteProductsDto,
} from './dto';
import { PaginationDto } from '../../shared/dto';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({
    status: 201,
    description: 'Product created successfully',
    type: ProductResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input data or validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 404,
    description: 'Product schema not found for organization',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to create product',
  })
  async createProduct(
    @CurrentUser() user: JwtPayload,
    @Body() createProductDto: CreateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.createProduct(Number(user.userId), createProductDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get products with pagination and search' })
  @ApiQuery({
    name: 'page',
    description: 'Page number (1-based)',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of items per page (max 100)',
    required: false,
    type: Number,
    example: 20,
  })
  @ApiQuery({
    name: 'search',
    description: 'Search term for filtering by product name or field values',
    required: false,
    type: String,
    example: 'laptop',
  })
  @ApiQuery({
    name: 'order',
    description: 'Sort order by creation date',
    required: false,
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @ApiQuery({
    name: 'status',
    description: 'Filter by product status',
    required: false,
    enum: ['ACTIVE', 'ARCHIVED','DRAFT'],
    example: 'ACTIVE',
  })
  @ApiResponse({
    status: 200,
    description: 'Products retrieved successfully',
    type: ProductPaginatedResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid pagination parameters',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to retrieve products',
  })
  async getProducts(
    @Query() paginationDto: PaginationDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProductPaginatedResponseDto> {
    return this.productsService.getProducts(Number(user.userId), paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiParam({
    name: 'id',
    description: 'Product ID',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Product retrieved successfully',
    type: ProductResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 404,
    description: 'Product not found or does not belong to your organization',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to retrieve product',
  })
  async getProductById(
    @Param('id', ParseIntPipe) productId: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProductResponseDto> {
    return this.productsService.getProductById(productId, Number(user.userId));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product' })
  @ApiParam({
    name: 'id',
    description: 'Product ID',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Product updated successfully',
    type: ProductResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input data or validation failed',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 404,
    description: 'Product not found or does not belong to your organization',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to update product',
  })
  async updateProduct(
    @Param('id', ParseIntPipe) productId: number,
    @CurrentUser() user: JwtPayload,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.updateProduct(productId, Number(user.userId), updateProductDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiParam({
    name: 'id',
    description: 'Product ID',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 204,
    description: 'Product deleted successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 404,
    description: 'Product not found or does not belong to your organization',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to delete product',
  })
  async deleteProduct(
    @Param('id', ParseIntPipe) productId: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    return this.productsService.deleteProduct(productId, Number(user.userId));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bulk delete products' })
  @ApiResponse({
    status: 204,
    description: 'Products deleted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid product IDs or no IDs provided',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  @ApiResponse({
    status: 404,
    description: 'One or more products not found or do not belong to your organization',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error - failed to delete products',
  })
  async bulkDeleteProducts(
    @CurrentUser() user: JwtPayload,
    @Body() bulkDeleteDto: BulkDeleteProductsDto,
  ): Promise<void> {
    return this.productsService.bulkDeleteProducts(Number(user.userId), bulkDeleteDto.ids);
  }
}
