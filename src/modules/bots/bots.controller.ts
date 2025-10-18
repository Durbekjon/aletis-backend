import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BotsService } from './bots.service';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@guards/jwt-auth.guard';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { Bot } from '@prisma/client';
import { webhookResponse } from '@core/webhook-helper/webhook-helper.service';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/auth/strategies/jwt.strategy';
import { PaginationDto } from '@/shared/dto';
import { BotPaginatedResponseDto } from './dto/bot-pagination.dto';
import { BotResponseDto } from './dto/bot-response.dto';

@ApiTags('Telegram Bots')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'bots', version: '1' })
export class BotsController {
  constructor(private readonly botsService: BotsService) {}

  @Post()
  @ApiOperation({ summary: 'Create new bot' })
  @ApiResponse({
    status: 201,
    description: 'Bot created successfully',
    type: Object,
  })
  async createBot(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBotDto,
  ): Promise<Bot> {
    return this.botsService.createBot(Number(user.userId), dto);
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
    description: 'Search term for filtering by product name or field values',
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
  @ApiOperation({ summary: 'Get all bots for current user organization' })
  @ApiResponse({
    status: 200,
    description: 'List of bots',
    type: BotPaginatedResponseDto,
  })
  async getBots(
    @CurrentUser() user: JwtPayload,
    @Query() paginationDto: PaginationDto,
  ): Promise<BotPaginatedResponseDto> {
    return this.botsService.getBots(
      Number(user.userId),
      paginationDto,
    ) as unknown as BotPaginatedResponseDto;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bot details by ID' })
  @ApiResponse({
    status: 200,
    description: 'Bot details',
    type: BotResponseDto,
  })
  async getBotDetails(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) botId: number,
  ): Promise<BotResponseDto> {
    return this.botsService.getBotDetails(Number(user.userId), botId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update bot by ID (token required)' })
  @ApiResponse({
    status: 200,
    description: 'Bot updated successfully',
    type: Object,
  })
  async updateBot(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) botId: number,
    @Body() dto: UpdateBotDto,
  ): Promise<Bot> {
    return this.botsService.updateBot(Number(user.userId), botId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete bot by ID' })
  @ApiResponse({
    status: 200,
    description: 'Bot deleted successfully',
    type: Object,
  })
  async deleteBot(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) botId: number,
  ): Promise<Bot> {
    return this.botsService.deleteBot(Number(user.userId), botId);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start bot (set Telegram webhook)' })
  @ApiResponse({
    status: 200,
    description: 'Bot started successfully',
    type: Object,
  })
  async startBot(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) botId: number,
  ): Promise<webhookResponse> {
    return this.botsService.startBot(Number(user.userId), botId);
  }

  @Post(':id/stop')
  @ApiOperation({ summary: 'Stop bot (delete Telegram webhook)' })
  @ApiResponse({
    status: 200,
    description: 'Bot stopped successfully',
    type: Object,
  })
  async stopBot(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) botId: number,
  ): Promise<webhookResponse> {
    return this.botsService.stopBot(Number(user.userId), botId);
  }
}
