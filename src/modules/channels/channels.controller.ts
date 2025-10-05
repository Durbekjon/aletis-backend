import { Body, Controller, Get, Param, Post, Patch,Delete, UseGuards } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import type { JwtPayload } from '@modules/auth/strategies/jwt.strategy';
import { UpdateChannelDto } from './dto/udpate-channel.dto';

@ApiTags('Channels')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'channels', version: '1' })
export class ChannelsController {
  constructor(private readonly channelService: ChannelsService) {}

  @Post()
  @ApiOperation({ description: 'Add telegram Channel' })
  async createChannel(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateChannelDto,
  ) {
    const { userId } = user;
    return this.channelService.createChannel(+userId, body);
  }

  @Get()
  @ApiOperation({ description: 'Get all telegram channels' })
  async getChannels(@CurrentUser() user: JwtPayload) {
    const { userId } = user;
    return this.channelService.getChannels(+userId);
  }

  @Get(':id')
  @ApiOperation({ description: 'Get a telegram channel by id' })
  async getChannelById(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const { userId } = user;
    return this.channelService.getChannelById(+userId, +id);
  }

  @Patch(':id')
  @ApiOperation({ description: 'Update a telegram channel by id' })
  async updateChannel(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: UpdateChannelDto) {
    const { userId } = user;
    return this.channelService.updateChannel(+userId, +id, body);
  }

  @Delete(':id')
  @ApiOperation({ description: 'Delete a telegram channel by id' })
  async deleteChannel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const { userId } = user;
    return this.channelService.deleteChannel(+userId, +id);
  }
}
