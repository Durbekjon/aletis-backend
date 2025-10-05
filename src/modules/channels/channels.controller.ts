import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import type { JwtPayload } from '@modules/auth/strategies/jwt.strategy';
import { UpdateChannelDto } from './dto/udpate-channel.dto';
import { PaginationDto } from '@/shared/dto';
import { ChannelPaginatedResponseDto } from './dto/channel-pagination.dto';

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
    description: 'Search by username or title',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'order',
    description: 'Sort order by creation date',
    required: false,
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  @ApiOperation({ description: 'Get all telegram channels' })
  @ApiResponse({
    status: 200,
    description: 'List of channels',
    type: ChannelPaginatedResponseDto,
  })
  async getChannels(
    @CurrentUser() user: JwtPayload,
    @Query() paginationDto: PaginationDto,
  ) {
    const { userId } = user;
    return this.channelService.getChannels(
      +userId,
      paginationDto,
    ) as unknown as ChannelPaginatedResponseDto;
  }

  @Get(':id')
  @ApiOperation({ description: 'Get a telegram channel by id' })
  async getChannelById(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const { userId } = user;
    return this.channelService.getChannelById(+userId, +id);
  }

  @Patch(':id')
  @ApiOperation({ description: 'Update a telegram channel by id' })
  async updateChannel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateChannelDto,
  ) {
    const { userId } = user;
    return this.channelService.updateChannel(+userId, +id, body);
  }

  @Delete(':id')
  @ApiOperation({ description: 'Delete a telegram channel by id' })
  async deleteChannel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const { userId } = user;
    return this.channelService.deleteChannel(+userId, +id);
  }
}
