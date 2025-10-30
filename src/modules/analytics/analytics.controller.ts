import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import type { JwtPayload } from '@auth/strategies/jwt.strategy';

@ApiTags('Analytics')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @ApiQuery({ name: 'period', required: false, type: String, example: '7d' })
  async getSummary(
    @CurrentUser() user: JwtPayload,
    @Query('period') period = '7d',
  ) {
    return this.analyticsService.getSummary(Number(user.userId), period);
  }

  @Get('trends')
  @ApiQuery({ name: 'period', required: false, type: String, example: '7d' })
  @ApiQuery({
    name: 'metric',
    required: false,
    type: String,
    example: 'revenue',
    enum: ['revenue', 'orders'],
  })
  async getTrends(
    @CurrentUser() user: JwtPayload,
    @Query('period') period = '7d',
    @Query('metric') metric: 'revenue' | 'orders' = 'revenue',
  ) {
    return this.analyticsService.getTrends(Number(user.userId), period, metric);
  }

  @Get('funnel')
  @ApiQuery({ name: 'period', required: false, type: String, example: '7d' })
  async getFunnel(
    @CurrentUser() user: JwtPayload,
    @Query('period') period = '7d',
  ) {
    return this.analyticsService.getFunnel(Number(user.userId), period);
  }

  @Get('top-products')
  @ApiQuery({ name: 'period', required: false, type: String, example: '7d' })
  async getTopProducts(
    @CurrentUser() user: JwtPayload,
    @Query('period') period = '7d',
  ) {
    return this.analyticsService.getTopProducts(Number(user.userId), period);
  }
}


