import { Controller, Get, Query } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { GetActivityLogsDto } from './dto/get-activity-logs.dto';

@Controller('activity-logs')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  async getRecent(@Query() query: GetActivityLogsDto) {
    const { organizationId, limit, lang, userId, entityType, action, from, to } = query;
    return this.activityLogService.getRecentLogs({
      organizationId,
      limit,
      lang,
      userId,
      entityType,
      action,
      from,
      to,
    });
  }
}


