import { Body, Controller, Post, Patch, Delete, Get, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/auth/strategies/jwt.strategy';
import { PaginationDto } from '@/shared/dto';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { SchedulePostDto } from './dto/schedule-post.dto';
import { PostPaginatedResponseDto } from './dto/post-pagination.dto';

@ApiTags('Posts')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'posts', version: '1' })
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a post' })
  @ApiResponse({ status: 201, description: 'Post created' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.createPost(+user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a post' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    const updated = await this.postsService.updatePost(+user.userId, +id, dto);
    // If already sent, sync Telegram
    if (updated.telegramId) {
      await this.postsService.editPostOnTelegram(updated.id);
    }
    return updated;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a post' })
  @ApiParam({ name: 'id', type: Number })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    await this.postsService.deletePost(+user.userId, +id);
  }

  @Get('channel/:channelId')
  @ApiOperation({ summary: 'Get paginated posts by channel id' })
  @ApiParam({ name: 'channelId', type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'], example: 'desc' })
  @ApiResponse({ status: 200, type: PostPaginatedResponseDto })
  async getByChannel(
    @CurrentUser() user: JwtPayload,
    @Param('channelId') channelId: string,
    @Query() pagination: PaginationDto,
  ): Promise<PostPaginatedResponseDto> {
    return this.postsService.getPostsByChannel(+user.userId, +channelId, pagination) as unknown as PostPaginatedResponseDto;
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Schedule a post to be sent' })
  @ApiParam({ name: 'id', type: Number })
  async schedule(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SchedulePostDto,
  ) {
    return this.postsService.schedulePost(+user.userId, +id, dto.scheduledAt);
  }
}


