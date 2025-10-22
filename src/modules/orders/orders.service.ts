import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '@core/prisma/prisma.service';
import { PaginatedResponseDto } from '@/shared/dto';
import {
  CreateOrderDto,
  OrderResponseDto,
  UpdateOrderDto,
  OrderPaginationDto,
} from './dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly include = {
    customer: {
      select: {
        id: true,
        name: true,
        username: true,
        telegramId: true,
      },
    },
    orderItems: {
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            images: {
              select: {
                id: true,
                key: true,
                originalName: true,
              },
            },
          },
        },
      },
    },
  };
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the organization ID for a user
   */
  private async getUserOrganizationId(userId: number): Promise<number> {
    const member = await this.prisma.member.findUnique({
      where: { userId },
      select: { organizationId: true },
    });
    if (!member) {
      throw new ForbiddenException('User is not a member of any organization');
    }
    return member.organizationId;
  }

  /**
   * Ensure the order belongs to the user's organization
   */
  private async ensureOrderOwnership(orderId: number, organizationId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { organizationId: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.organizationId !== organizationId) {
      throw new ForbiddenException(
        'Order does not belong to your organization',
      );
    }
    return order;
  }

  /**
   * Create a new order
   */
  async createOrder(
    userId: number,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const organizationId = await this.getUserOrganizationId(userId);

    // If customerId is provided, ensure it belongs to the organization
    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
        select: { organizationId: true },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      if (customer.organizationId !== organizationId) {
        throw new ForbiddenException(
          'Customer does not belong to your organization',
        );
      }
    }

    // Process items from details.items array (for AI-generated orders)
    let orderItemsData: any[] = [];
    let calculatedTotalPrice = 0;

    this.logger.log(`🔍 CREATE ORDER DEBUG - Starting order creation process`);
    this.logger.log(
      `📋 Order DTO details: ${JSON.stringify(dto.details, null, 2)}`,
    );

    if (
      dto.details &&
      Array.isArray(dto.details.items) &&
      dto.details.items.length > 0
    ) {
      this.logger.log(
        `🛍️ MULTIPLE ITEMS DETECTED - Processing ${dto.details.items.length} items from details.items`,
      );
      this.logger.log(
        `📦 Raw items data: ${JSON.stringify(dto.details.items, null, 2)}`,
      );

      // Validate and process each item from details.items
      this.logger.log(`🔍 VALIDATION - Starting item validation process`);
      const validItems = dto.details.items.filter(
        (item: any, index: number) => {
          this.logger.log(
            `🔍 Validating item ${index + 1}: ${JSON.stringify(item)}`,
          );

          const productId = parseInt(item.productId);
          const itemQuantity = parseInt(item.quantity) || 1;
          const itemPrice = parseFloat(item.price) || 0;

          this.logger.log(
            `📊 Item ${index + 1} parsed values: productId=${productId}, quantity=${itemQuantity}, price=${itemPrice}`,
          );

          if (isNaN(productId) || productId <= 0) {
            this.logger.warn(
              `❌ INVALID ITEM ${index + 1} - Invalid productId: ${productId} in item: ${JSON.stringify(item)}`,
            );
            return false;
          }

          if (itemQuantity <= 0) {
            this.logger.warn(
              `❌ INVALID ITEM ${index + 1} - Invalid quantity: ${itemQuantity} in item: ${JSON.stringify(item)}`,
            );
            return false;
          }

          this.logger.log(
            `✅ VALID ITEM ${index + 1} - ProductId: ${productId}, Quantity: ${itemQuantity}, Price: ${itemPrice}`,
          );
          return true;
        },
      );

      this.logger.log(
        `📊 VALIDATION RESULT - Valid items after filtering: ${validItems.length}/${dto.details.items.length}`,
      );

      if (validItems.length > 0) {
        this.logger.log(
          `💰 PRICE CALCULATION - Starting total price calculation for ${validItems.length} valid items`,
        );

        // Calculate total price from valid items
        calculatedTotalPrice = validItems.reduce(
          (sum: number, item: any, index: number) => {
            const itemPrice = parseFloat(item.price) || 0;
            const itemQuantity = parseInt(item.quantity) || 1;
            const itemTotal = itemPrice * itemQuantity;

            this.logger.log(
              `💰 Item ${index + 1} calculation: ${itemPrice} × ${itemQuantity} = ${itemTotal}`,
            );
            this.logger.log(
              `💰 Running total: ${sum} + ${itemTotal} = ${sum + itemTotal}`,
            );

            return sum + itemTotal;
          },
          0,
        );

        this.logger.log(
          `💰 FINAL TOTAL PRICE CALCULATED: ${calculatedTotalPrice}`,
        );

        // Create order items data
        this.logger.log(
          `📝 CREATING ORDER ITEMS DATA - Mapping ${validItems.length} valid items to order items`,
        );
        orderItemsData = validItems.map((item: any, index: number) => {
          const orderItem = {
            productId: parseInt(item.productId),
            quantity: parseInt(item.quantity) || 1,
            price: parseFloat(item.price) || 0,
          };

          this.logger.log(
            `📝 Order item ${index + 1}: ${JSON.stringify(orderItem)}`,
          );
          return orderItem;
        });

        this.logger.log(
          `📝 ORDER ITEMS DATA CREATED: ${orderItemsData.length} items`,
        );
        this.logger.log(
          `📝 Final order items data: ${JSON.stringify(orderItemsData, null, 2)}`,
        );

        // Validate that all products exist in the organization
        this.logger.log(
          `🔍 PRODUCT VALIDATION - Checking if all products exist in organization ${organizationId}`,
        );
        const productIds = orderItemsData.map((item) => item.productId);
        this.logger.log(`🔍 Product IDs to validate: ${productIds.join(', ')}`);

        const existingProducts = await this.prisma.product.findMany({
          where: {
            id: { in: productIds },
            organizationId,
          },
          select: { id: true, name: true, price: true },
        });

        this.logger.log(
          `✅ PRODUCT VALIDATION RESULT - Found ${existingProducts.length} existing products out of ${productIds.length} requested`,
        );
        this.logger.log(
          `📦 Existing products: ${JSON.stringify(existingProducts, null, 2)}`,
        );

        if (existingProducts.length !== productIds.length) {
          this.logger.warn(
            `⚠️ MISSING PRODUCTS - Some products not found. Requested: ${productIds.join(', ')}, Found: ${existingProducts.map((p) => p.id).join(', ')}`,
          );
        } else {
          this.logger.log(
            `✅ ALL PRODUCTS FOUND - All ${productIds.length} products exist in organization`,
          );
        }
      }
    }

    // If productIds are provided (for manual orders), ensure they belong to the organization
    if (dto.productIds && dto.productIds.length > 0) {
      const products = await this.prisma.product.findMany({
        where: {
          id: { in: dto.productIds },
          organizationId,
        },
        select: { id: true, price: true },
      });

      if (products.length !== dto.productIds.length) {
        throw new BadRequestException(
          'One or more products do not belong to your organization',
        );
      }

      // If no items from details.items, create order items from productIds
      if (orderItemsData.length === 0) {
        orderItemsData = dto.productIds.map((productId) => {
          const product = products.find((p) => p.id === productId);
          return {
            productId,
            quantity: 1, // Default quantity for manual orders
            price: product?.price || 0,
          };
        });

        // Calculate total price from productIds
        calculatedTotalPrice = orderItemsData.reduce((sum, item) => {
          return sum + item.price * item.quantity;
        }, 0);
      }
    }

    // Use calculated total price if not provided in DTO
    const finalTotalPrice = dto.totalPrice || calculatedTotalPrice;

    this.logger.log(`🎯 FINAL ORDER CREATION SUMMARY:`);
    this.logger.log(`📊 Total order items to create: ${orderItemsData.length}`);
    this.logger.log(`💰 Final total price: ${finalTotalPrice}`);
    this.logger.log(`🏢 Organization ID: ${organizationId}`);
    this.logger.log(`👤 Customer ID: ${dto.customerId || 'Not provided'}`);
    this.logger.log(`📋 Order status: ${dto.status || OrderStatus.NEW}`);

    this.logger.log(`🚀 CREATING ORDER IN DATABASE...`);
    const order = await this.prisma.order.create({
      data: {
        status: dto.status || OrderStatus.NEW,
        customerId: dto.customerId,
        details: dto.details as Prisma.InputJsonValue,
        organizationId,
        totalPrice: finalTotalPrice,
        orderItems:
          orderItemsData.length > 0
            ? {
                create: orderItemsData,
              }
            : undefined,
      },
      include: this.include,
    });

    this.logger.log(`🎉 ORDER CREATED SUCCESSFULLY!`);
    this.logger.log(`📋 Order ID: ${order.id}`);
    this.logger.log(`🏢 Organization: ${organizationId}`);
    this.logger.log(`🛍️ Order items created: ${orderItemsData.length}`);
    this.logger.log(`💰 Total price: ${finalTotalPrice}`);
    this.logger.log(
      `📊 Actual order items in DB: ${order.orderItems?.length || 0}`,
    );

    if (order.orderItems && order.orderItems.length > 0) {
      this.logger.log(`📦 Order items details:`);
      order.orderItems.forEach((item: any, index: number) => {
        this.logger.log(
          `  ${index + 1}. Product ID: ${item.productId}, Quantity: ${item.quantity}, Price: ${item.price}`,
        );
      });
    }
    return this.mapOrderToResponse(order);
  }

  /**
   * Get all orders with pagination and search
   */
  async getOrders(
    userId: number,
    pagination: OrderPaginationDto,
  ): Promise<PaginatedResponseDto<OrderResponseDto>> {
    const organizationId = await this.getUserOrganizationId(userId);

    // Build search filter
    const searchFilter = pagination.search
      ? {
          OR: [
            {
              customer: {
                name: {
                  contains: pagination.search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            },
            {
              id: {
                equals: isNaN(Number(pagination.search))
                  ? undefined
                  : Number(pagination.search),
              },
            },
            {
              details: {
                path: [],
                string_contains: pagination.search,
              },
            },
          ],
        }
      : {};

    // Build status and payment status filters
    const statusFilter = pagination.status ? { status: pagination.status } : {};
    const paymentStatusFilter = pagination.paymentStatus
      ? { paymentStatus: pagination.paymentStatus }
      : {};

    const whereClause = {
      organizationId,
      ...searchFilter,
      ...statusFilter,
      ...paymentStatusFilter,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: whereClause,
        include: this.include,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: pagination.order },
      }),
      this.prisma.order.count({ where: whereClause }),
    ]);

    const mappedItems = items.map((order) => this.mapOrderToResponse(order));

    return new PaginatedResponseDto(
      mappedItems,
      total,
      pagination.page ?? 1,
      pagination.limit ?? 20,
    );
  }

  /**
   * Get order by ID
   */
  async getOrderById(
    userId: number,
    orderId: number,
  ): Promise<OrderResponseDto> {
    const organizationId = await this.getUserOrganizationId(userId);
    await this.ensureOrderOwnership(orderId, organizationId);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: this.include,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.mapOrderToResponse(order);
  }

  /**
   * Update order status
   */
  async updateOrder(
    userId: number,
    orderId: number,
    dto: UpdateOrderDto,
  ): Promise<OrderResponseDto> {
    const organizationId = await this.getUserOrganizationId(userId);
    await this.ensureOrderOwnership(orderId, organizationId);
    const { paymentStatus, orderStatus, notes } = dto;

    const data: Prisma.OrderUpdateInput = {
      updatedAt: new Date(),
    };
    if (paymentStatus) {
      data.paymentStatus = paymentStatus;
    }
    if (orderStatus) {
      data.status = orderStatus;
    }
    if (notes) {
      data.notes = notes;
    }
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        ...data,
      },
      include: this.include,
    });

    // this.logger.log(`Order ${orderId} status updated to ${dto.status}`);
    return this.mapOrderToResponse(order);
  }

  /**
   * Delete order
   */
  async deleteOrder(
    userId: number,
    orderId: number,
  ): Promise<{ success: boolean }> {
    const organizationId = await this.getUserOrganizationId(userId);
    await this.ensureOrderOwnership(orderId, organizationId);
    await this.prisma.$transaction([
      this.prisma.orderItem.deleteMany({
        where: { orderId },
      }),
      this.prisma.order.delete({
        where: { id: orderId },
      }),
    ]);

    this.logger.log(`Order ${orderId} deleted`);
    return { success: true };
  }

  /**
   * Create order from webhook/AI data
   */
  async createOrderFromWebhook(
    organizationId: number,
    customerId: number,
    orderData: any,
  ): Promise<OrderResponseDto> {
    const { customerName, customerContact, items, notes } = orderData;

    // Process items if provided
    let orderItemsData: any[] = [];
    let calculatedTotalPrice = 0;

    if (Array.isArray(items) && items.length > 0) {
      this.logger.log(`Processing ${items.length} items from webhook`);

      // Validate and process each item
      const validItems = items.filter((item: any) => {
        const productId = parseInt(item.productId);
        const itemQuantity = parseInt(item.quantity) || 1;
        const itemPrice = parseFloat(item.price) || 0;

        if (isNaN(productId) || productId <= 0) {
          this.logger.warn(
            `Invalid productId in webhook item: ${JSON.stringify(item)}`,
          );
          return false;
        }

        if (itemQuantity <= 0) {
          this.logger.warn(
            `Invalid quantity in webhook item: ${JSON.stringify(item)}`,
          );
          return false;
        }

        return true;
      });

      if (validItems.length > 0) {
        // Calculate total price from valid items
        calculatedTotalPrice = validItems.reduce((sum: number, item: any) => {
          const itemPrice = parseFloat(item.price) || 0;
          const itemQuantity = parseInt(item.quantity) || 1;
          return sum + itemPrice * itemQuantity;
        }, 0);

        // Create order items data
        orderItemsData = validItems.map((item: any) => ({
          productId: parseInt(item.productId),
          quantity: parseInt(item.quantity) || 1,
          price: parseFloat(item.price) || 0,
        }));

        // Validate that all products exist in the organization
        const productIds = orderItemsData.map((item) => item.productId);
        const existingProducts = await this.prisma.product.findMany({
          where: {
            id: { in: productIds },
            organizationId,
          },
          select: { id: true, name: true, price: true },
        });

        this.logger.log(
          `Found ${existingProducts.length} existing products out of ${productIds.length} requested`,
        );

        if (existingProducts.length !== productIds.length) {
          this.logger.warn(
            `Some products not found in webhook order. Requested: ${productIds.join(', ')}, Found: ${existingProducts.map((p) => p.id).join(', ')}`,
          );
        }
      }
    }

    // Extract customer details for storage in order.details
    const customerDetails = {
      phoneNumber: customerContact || 'Not provided',
      name: customerName || 'Not provided',
      location: 'Not provided', // Will be updated when customer provides it
      items: items || [],
      notes: notes || '',
      createdAt: new Date().toISOString(),
      source: 'WEBHOOK',
    };

    this.logger.log(
      `Creating webhook order with ${orderItemsData.length} order items and total price: ${calculatedTotalPrice}`,
    );

    const order = await this.prisma.order.create({
      data: {
        status: OrderStatus.NEW,
        customerId,
        details: customerDetails as Prisma.InputJsonValue,
        organizationId,
        totalPrice: calculatedTotalPrice,
        orderItems:
          orderItemsData.length > 0
            ? {
                create: orderItemsData,
              }
            : undefined,
      },
      include: this.include,
    });

    this.logger.log(
      `Order created from webhook: ${order.id} for customer: ${customerId} with ${orderItemsData.length} order items`,
    );
    return this.mapOrderToResponse(order);
  }

  /**
   * Get orders for AI context
   */
  async getOrdersForAI(
    organizationId: number,
    customerId?: number,
  ): Promise<any[]> {
    const whereClause: Prisma.OrderWhereInput = {
      organizationId,
    };

    if (customerId) {
      whereClause.customerId = customerId;
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      include: this.include,
      orderBy: { createdAt: 'desc' },
      take: 10, // Limit to recent orders for AI context
    });
    return orders.map((order) => ({
      id: order.id,
      status: order.status,
      details: order.details,
      createdAt: order.createdAt,
      customer: order.customerId,
      items:
        order.orderItems?.map((item: any) => ({
          productName: item.product?.name || 'Unknown Product',
          quantity: item.quantity,
          price: item.price,
        })) || [],
    }));
  }

  /**
   * Create order from AI response data
   */
  async createFromAIResponse(
    aiResponse: any,
    customer: any,
    organizationId: number,
  ): Promise<OrderResponseDto> {
    const { customerName, customerContact, items, notes } = aiResponse;

    this.logger.log(`🤖 AI RESPONSE ORDER CREATION - Starting process`);
    this.logger.log(
      `👤 Customer: ${customerName || customer.name || 'Not provided'}`,
    );
    this.logger.log(`📞 Contact: ${customerContact || 'Not provided'}`);
    this.logger.log(`📝 Notes: ${notes || 'None'}`);
    this.logger.log(`🏢 Organization ID: ${organizationId}`);

    // Calculate total price from items if provided
    let totalPrice = 0;
    let quantity = 1;
    const productIds: number[] = [];
    let validItems: any[] = [];

    if (Array.isArray(items) && items.length > 0) {
      this.logger.log(
        `🛍️ AI MULTIPLE ITEMS DETECTED - Processing ${items.length} items for order creation`,
      );
      this.logger.log(`📦 AI Items data: ${JSON.stringify(items, null, 2)}`);

      // Validate and process each item
      this.logger.log(`🔍 AI VALIDATION - Starting item validation process`);
      validItems = items.filter((item: any, index: number) => {
        this.logger.log(
          `🔍 AI Validating item ${index + 1}: ${JSON.stringify(item)}`,
        );

        const productId = parseInt(item.productId);
        const itemQuantity = parseInt(item.quantity) || 1;
        const itemPrice = parseFloat(item.price) || 0;

        this.logger.log(
          `📊 AI Item ${index + 1} parsed values: productId=${productId}, quantity=${itemQuantity}, price=${itemPrice}`,
        );

        if (isNaN(productId) || productId <= 0) {
          this.logger.warn(
            `❌ AI INVALID ITEM ${index + 1} - Invalid productId: ${productId} in item: ${JSON.stringify(item)}`,
          );
          return false;
        }

        if (itemQuantity <= 0) {
          this.logger.warn(
            `❌ AI INVALID ITEM ${index + 1} - Invalid quantity: ${itemQuantity} in item: ${JSON.stringify(item)}`,
          );
          return false;
        }

        this.logger.log(
          `✅ AI VALID ITEM ${index + 1} - ProductId: ${productId}, Quantity: ${itemQuantity}, Price: ${itemPrice}`,
        );
        return true;
      });

      this.logger.log(
        `📊 AI VALIDATION RESULT - Valid items after filtering: ${validItems.length}/${items.length}`,
      );

      if (validItems.length === 0) {
        this.logger.warn(
          '❌ AI NO VALID ITEMS - No valid items found, creating order without items',
        );
      } else {
        this.logger.log(
          `💰 AI PRICE CALCULATION - Starting total price calculation for ${validItems.length} valid items`,
        );

        // Calculate total price and quantity from valid items
        totalPrice = validItems.reduce(
          (sum: number, item: any, index: number) => {
            const itemPrice = parseFloat(item.price) || 0;
            const itemQuantity = parseInt(item.quantity) || 1;
            const itemTotal = itemPrice * itemQuantity;

            this.logger.log(
              `💰 AI Item ${index + 1} calculation: ${itemPrice} × ${itemQuantity} = ${itemTotal}`,
            );
            this.logger.log(
              `💰 AI Running total: ${sum} + ${itemTotal} = ${sum + itemTotal}`,
            );

            return sum + itemTotal;
          },
          0,
        );

        this.logger.log(`💰 AI FINAL TOTAL PRICE CALCULATED: ${totalPrice}`);

        quantity = validItems.reduce((sum: number, item: any) => {
          return sum + (parseInt(item.quantity) || 1);
        }, 0);

        // Extract product IDs for validation
        const extractedIds = validItems
          .map((item: any) => parseInt(item.productId))
          .filter((id: number) => !isNaN(id));

        productIds.push(...extractedIds);
        this.logger.log(`Extracted product IDs: ${productIds.join(', ')}`);

        // Validate that all products exist in the organization
        if (productIds.length > 0) {
          const existingProducts = await this.prisma.product.findMany({
            where: {
              id: { in: productIds },
              organizationId,
            },
            select: { id: true, name: true, price: true },
          });

          this.logger.log(
            `Found ${existingProducts.length} existing products out of ${productIds.length} requested`,
          );

          if (existingProducts.length !== productIds.length) {
            this.logger.warn(
              `Some products not found. Requested: ${productIds.join(', ')}, Found: ${existingProducts.map((p) => p.id).join(', ')}`,
            );
          }
        }
      }
    }

    // Extract customer details for storage in order.details
    const customerDetails = {
      phoneNumber: customerContact || 'Not provided',
      name: customerName || customer.name || 'Not provided',
      location: 'Not provided', // Will be updated when customer provides it
      items: items || [],
      notes: notes || '',
      createdAt: new Date().toISOString(),
      source: 'AI_INTENT',
    };

    // Create order items data using the same validation logic as above
    this.logger.log(
      `📝 AI CREATING ORDER ITEMS DATA - Mapping ${validItems.length} valid items to order items`,
    );
    const orderItemsData = validItems.map((item: any, index: number) => {
      const orderItem = {
        productId: parseInt(item.productId),
        quantity: parseInt(item.quantity) || 1,
        price: parseFloat(item.price) || 0,
      };

      this.logger.log(
        `📝 AI Order item ${index + 1}: ${JSON.stringify(orderItem)}`,
      );
      return orderItem;
    });

    this.logger.log(
      `📝 AI ORDER ITEMS DATA CREATED: ${orderItemsData.length} items`,
    );
    this.logger.log(
      `📝 AI Final order items data: ${JSON.stringify(orderItemsData, null, 2)}`,
    );

    this.logger.log(`🎯 AI FINAL ORDER CREATION SUMMARY:`);
    this.logger.log(
      `📊 AI Total order items to create: ${orderItemsData.length}`,
    );
    this.logger.log(`💰 AI Final total price: ${totalPrice}`);
    this.logger.log(`🏢 AI Organization ID: ${organizationId}`);
    this.logger.log(`👤 AI Customer ID: ${customer.id}`);
    this.logger.log(`📋 AI Order status: NEW`);

    this.logger.log(`🚀 AI CREATING ORDER IN DATABASE...`);
    const order = await this.prisma.order.create({
      data: {
        status: OrderStatus.NEW,
        customerId: customer.id,
        details: customerDetails as Prisma.InputJsonValue,
        organizationId,
        totalPrice,
        orderItems:
          orderItemsData.length > 0
            ? {
                create: orderItemsData,
              }
            : undefined,
      },
      include: this.include,
    });

    this.logger.log(`🎉 AI ORDER CREATED SUCCESSFULLY!`);
    this.logger.log(`📋 AI Order ID: ${order.id}`);
    this.logger.log(`🏢 AI Organization: ${organizationId}`);
    this.logger.log(`🛍️ AI Order items created: ${orderItemsData.length}`);
    this.logger.log(`💰 AI Total price: ${totalPrice}`);
    this.logger.log(
      `📊 AI Actual order items in DB: ${order.orderItems?.length || 0}`,
    );

    if (order.orderItems && order.orderItems.length > 0) {
      this.logger.log(`📦 AI Order items details:`);
      order.orderItems.forEach((item: any, index: number) => {
        this.logger.log(
          `  ${index + 1}. Product ID: ${item.productId}, Quantity: ${item.quantity}, Price: ${item.price}`,
        );
      });
    }
    return this.mapOrderToResponse(order);
  }

  /**
   * Get orders for a specific customer
   */
  async getOrdersForCustomer(
    customerId: number,
    organizationId: number,
    limit: number = 5,
  ): Promise<OrderResponseDto[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        organizationId,
      },
      include: this.include,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return orders.map((order) => this.mapOrderToResponse(order));
  }

  /**
   * Update order details (for AI-driven updates)
   */
  async updateOrderDetails(
    orderId: number,
    customerId: number,
    organizationId: number,
    updates: Partial<{
      status: OrderStatus;
      details: Record<string, any>;
      quantity: number;
      totalPrice: number;
    }>,
  ): Promise<OrderResponseDto> {
    // Ensure order belongs to customer and organization
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        customerId,
        organizationId,
      },
    });

    if (!order) {
      throw new NotFoundException(
        'Order not found or does not belong to customer',
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
      include: this.include,
    });

    this.logger.log(`Order ${orderId} details updated via AI`);
    return this.mapOrderToResponse(updatedOrder);
  }

  /**
   * Cancel order (AI-driven cancellation)
   */
  async cancelOrder(
    orderId: number,
    customerId: number,
    organizationId: number,
  ): Promise<OrderResponseDto> {
    // Ensure order belongs to customer and organization
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        customerId,
        organizationId,
      },
    });

    if (!order) {
      throw new NotFoundException(
        'Order not found or does not belong to customer',
      );
    }

    // Only allow cancellation of NEW or PENDING orders
    if (
      order.status !== OrderStatus.NEW &&
      order.status !== OrderStatus.PENDING
    ) {
      throw new BadRequestException(
        `Cannot cancel order with status: ${order.status}`,
      );
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        updatedAt: new Date(),
        details: {
          ...(order.details as Record<string, any>),
          cancelledAt: new Date().toISOString(),
          cancelledBy: 'AI_INTENT',
        } as Prisma.InputJsonValue,
      },
      include: this.include,
    });

    this.logger.log(`Order ${orderId} cancelled via AI`);
    return this.mapOrderToResponse(updatedOrder);
  }

  /**
   * Map Prisma order to response DTO
   */
  private mapOrderToResponse(order: any): OrderResponseDto {
    return {
      id: order.id,
      orderNumber: `ORD-${order.id.toString().padStart(3, '0')}`,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      status: order.status,
      paymentStatus: order.paymentStatus,
      notes: order.notes,
      customer: order.customer
        ? {
            id: order.customer.id,
            name: order.customer.name,
            username: order.customer.username,
            telegramId: order.customer.telegramId,
          }
        : undefined,
      details: order.details,
      organizationId: order.organizationId,
      quantity: order.quantity,
      totalPrice: order.totalPrice,
      discountAmount: order.discountAmount || 0,
      discountPercentage: order.discountPercentage || 0,
      products: order.products || [],
      orderItems: order.orderItems || [],
      trackingNumber: order.trackingNumber,
    };
  }
}
