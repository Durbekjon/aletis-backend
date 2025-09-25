// import { Injectable, Logger } from '@nestjs/common';
// import { PrismaService } from '../../core/prisma/prisma.service';
// import { CreateProductDto } from './dto/create-product.dto';
// import type { Product } from '@prisma/client';

// @Injectable()
// export class ProductsService {
//   private readonly logger = new Logger(ProductsService.name);

//   constructor(private readonly prisma: PrismaService) {}

//   async createProduct(
//     userId: number,
//     createProductDto: CreateProductDto,
//   ): Promise<Product> {
//     return this.prisma.product.create({
//       data: {
//         organizationId: userId, //todo
//         ...createProductDto,
//       },
//     });
//   }

//   async getProductsByUser(userId: number): Promise<Product[]> {
//     return this.prisma.product.findMany({
//       where: { organizationId: userId, isActive: true }, //todo
//       orderBy: { createdAt: 'desc' },
//     });
//   }

//   async getProductsForAI(userId: number): Promise<string> {
//     const products = await this.getProductsByUser(userId);

//     if (products.length === 0) {
//       return 'No products are currently available in inventory.';
//     }

//     const productList = products
//       .map((product) => {
//         const stockInfo =
//           product.stock > 0 ? `(${product.stock} in stock)` : '(out of stock)';
//         const priceInfo = product.price ? `$${product.price}` : 'Price not set';
//         return `- ${product.name}: ${product.description || 'No description'} - ${priceInfo} ${stockInfo}`;
//       })
//       .join('\n');

//     return `Available products:\n${productList}`;
//   }

//   async updateProduct(
//     userId: number,
//     productId: number,
//     updateData: Partial<CreateProductDto>,
//   ): Promise<Product> {
//     return this.prisma.product.update({
//       where: { id: productId, organizationId: userId }, //todo
//       data: updateData,
//     });
//   }

//   async deleteProduct(userId: number, productId: number): Promise<Product> {
//     return this.prisma.product.update({
//       where: { id: productId, organizationId: userId }, //todo
//       data: { isActive: false },
//     });
//   }
// }
