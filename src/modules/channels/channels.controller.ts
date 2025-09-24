import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@Controller('channels')
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  async getUserChannels(@CurrentUser() user: JwtPayload) {
    return this.channelsService.getChannelsForUser(Number(user.userId));
  }

  @Delete(':id')
  async disconnectChannel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) channelId: number,
  ): Promise<{ message: string }> {
    await this.channelsService.disconnectChannel(
      Number(user.userId),
      channelId,
    );
    return { message: 'Channel disconnected successfully' };
  }
}
