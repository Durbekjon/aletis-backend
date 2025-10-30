import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/auth/strategies/jwt.strategy';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { PaginationDto } from '@/shared/dto';
import { CustomerPaginatedResponseDto } from './dto/customer-pagination.dto';

@ApiTags('Customers')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
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
    description: 'Search term for filtering by name or username',
    required: false,
    type: String,
    example: 'john',
  })
  @ApiQuery({
    name: 'order',
    description: 'Sort order by creation date',
    required: false,
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @ApiOperation({ summary: 'Get all customers for current user organization' })
  @ApiOkResponse({
    description: 'List of customers',
    type: CustomerPaginatedResponseDto,
  })
  async getCustomers(
    @CurrentUser() user: JwtPayload,
    @Query() paginationDto: PaginationDto,
  ): Promise<CustomerPaginatedResponseDto> {
    return this.customersService.getCustomers(
      Number(user.userId),
      paginationDto,
    ) as unknown as CustomerPaginatedResponseDto;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a customer by ID' })
  @ApiOkResponse({
    description: 'Customer details',
  })
  async getCustomer(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.customersService.getCustomerDetails(Number(user.userId), id);
  }

  @Get(':id/lang/:lang')
  async setCustomerLang(
    @Param('id', ParseIntPipe) id: number,
    @Param('lang') lang: string,
  ) {
    await this.customersService.setCustomerLang(id, lang);
    return { success: true };
  }
}
