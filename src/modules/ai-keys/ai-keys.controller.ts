import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '@auth/guards/platform-admin.guard';
import { AiKeysService } from './ai-keys.service';
import {
  AiKeyResponseDto,
  CreateAiKeyDto,
  UpdateAiKeyDto,
} from './dto';

@ApiTags('Admin · AI Keys')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller({ path: 'admin/ai-keys', version: '1' })
export class AiKeysController {
  constructor(private readonly aiKeysService: AiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List all AI API keys (metadata only)' })
  @ApiOkResponse({ type: AiKeyResponseDto, isArray: true })
  list(): Promise<AiKeyResponseDto[]> {
    return this.aiKeysService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single AI API key (metadata only)' })
  @ApiOkResponse({ type: AiKeyResponseDto })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<AiKeyResponseDto> {
    return this.aiKeysService.findById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Register a new AI API key',
    description:
      'The raw `apiKey` is encrypted at rest and never returned by any endpoint.',
  })
  @ApiOkResponse({ type: AiKeyResponseDto })
  create(@Body() dto: CreateAiKeyDto): Promise<AiKeyResponseDto> {
    return this.aiKeysService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update label / status / key / clearExhausted flag',
  })
  @ApiOkResponse({ type: AiKeyResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAiKeyDto,
  ): Promise<AiKeyResponseDto> {
    return this.aiKeysService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an AI API key' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.aiKeysService.remove(id);
  }
}
