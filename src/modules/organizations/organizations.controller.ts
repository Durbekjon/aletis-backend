import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import type { JwtPayload } from '@auth/strategies/jwt.strategy';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Organizations')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create organization' })
  @ApiBody({ type: CreateOrganizationDto })
  @ApiOkResponse({ description: 'Created organization' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrganizationDto) {
    return this.service.createOrganization(Number(user.userId), dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get organization of current user' })
  @ApiOkResponse({ description: 'organization of current user' })
  getMyOrganization(@CurrentUser() user: JwtPayload) {
    return this.service.getMyOrganization(Number(user.userId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization details' })
  @ApiOkResponse({ description: 'Organization with relations' })
  getOrganizationById(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.getOrganizationById(Number(user.userId), id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update organization (admin only)',
    description:
      'Update organization information. To upload an organization logo: 1) First upload a file using POST /v1/files/upload, 2) Use the returned file ID as logoId in this request. The old logo will be automatically deleted when updating.',
  })
  @ApiBody({ type: UpdateOrganizationDto })
  @ApiOkResponse({ description: 'Updated organization' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.service.updateOrganization(Number(user.userId), id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete organization (admin only)' })
  @ApiOkResponse({ description: 'Deleted organization' })
  deleteOrganization(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deleteOrganization(Number(user.userId), id);
  }
}
