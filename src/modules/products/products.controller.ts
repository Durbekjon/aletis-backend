import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import type { Product } from '@prisma/client';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getProducts(@CurrentUser() user: JwtPayload): Promise<Product[]> {
    const userId = Number(user.userId);
    return this.productsService.getProductsByUser(userId);
  }

  @Post()
  async createProduct(
    @CurrentUser() user: JwtPayload,
    @Body() createProductDto: CreateProductDto,
  ): Promise<Product> {
    const userId = Number(user.userId);
    return this.productsService.createProduct(userId, createProductDto);
  }

  @Put(':id')
  async updateProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() updateProductDto: Partial<CreateProductDto>,
  ): Promise<Product> {
    const userId = Number(user.userId);
    const productId = Number(id);
    return this.productsService.updateProduct(
      userId,
      productId,
      updateProductDto,
    );
  }

  @Delete(':id')
  async deleteProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<Product> {
    const userId = Number(user.userId);
    const productId = Number(id);
    return this.productsService.deleteProduct(userId, productId);
  }
}
