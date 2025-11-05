import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/auth/strategies/jwt.strategy';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { ActivityLogPaginationDto } from './dto/activity-log-pagination.dto';
import { ActivityLogPaginatedResponseDto } from './dto/activity-log-paginated-response.dto';

@ApiTags('Activity Logs')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'activity-logs', version: '1' })
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @ApiOperation({ summary: 'Get activity logs for current organization' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (1-based)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Items per page (max 100)',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    example: 'desc',
    description: 'Sort by creation date',
  })
  @ApiQuery({
    name: 'lang',
    required: false,
    enum: ['en', 'uz', 'ru'],
    example: 'uz',
    description: 'Message language',
  })
  @ApiQuery({
    name: 'entityType',
    required: false,
    enum: ['PRODUCT', 'ORDER', 'BOT', 'CHANNEL', 'POST', 'SCHEMA'],
    description: 'Filter by entity type',
  })
  @ApiQuery({
    name: 'action',
    required: false,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'PUBLISH'],
    description: 'Filter by action type',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2024-01-01T00:00:00.000Z',
    description: 'Start date (ISO8601)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2024-01-31T23:59:59.000Z',
    description: 'End date (ISO8601)',
  })
  @ApiResponse({
    status: 200,
    description: 'Activity logs retrieved',
    type: ActivityLogPaginatedResponseDto,
  })
  async getRecent(
    @Query() query: ActivityLogPaginationDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ActivityLogPaginatedResponseDto> {
    return this.activityLogService.getRecentLogs(Number(user.userId), query);
  }
}
