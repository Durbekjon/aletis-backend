import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { InstagramService } from './instagram.service';
import { JwtAuthGuard } from '@guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { JwtPayload } from '@modules/auth/strategies/jwt.strategy';
import { SendMessageDto } from './dto/send-message.dto';
import { PrismaService } from '@core/prisma/prisma.service';

/**
 * Instagram Controller
 * Handles Instagram OAuth, webhooks, and message sending
 */
@ApiTags('Instagram')
@Controller({ path: 'instagram', version: '1' })
export class InstagramController {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Initiates Instagram OAuth flow
   * Redirects user to Instagram authorization page
   */
  @Get('connect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Connect Instagram account',
    description:
      'Redirects user to Instagram OAuth page to authorize the application',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Instagram OAuth URL',
  })
  async connect(@Res() res: Response) {
    try {
      const authUrl = this.instagramService.getAuthUrl();
      return res.redirect(authUrl);
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to initiate Instagram OAuth',
      );
    }
  }

  /**
   * Handles Instagram OAuth callback
   * Exchanges authorization code for access token and saves account data
   */
  @Get('callback')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Instagram OAuth callback',
    description:
      'Handles the callback from Instagram OAuth and saves the account data',
  })
  @ApiQuery({
    name: 'code',
    description: 'Authorization code from Instagram',
    required: false,
  })
  @ApiQuery({
    name: 'error',
    description: 'Error code if authorization was denied',
    required: false,
  })
  @ApiQuery({
    name: 'error_reason',
    description: 'Error reason if authorization was denied',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Instagram account connected successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Authorization failed or was denied',
  })
  async callback(
    @CurrentUser() user: JwtPayload,
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('error_reason') errorReason: string,
    @Res() res: Response,
  ) {
    try {
      // Handle OAuth errors
      if (error) {
        this.instagramService['logger'].warn(
          `Instagram OAuth error: ${error} - ${errorReason}`,
        );
        // Redirect to frontend error page or return error
        return res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:3000'}/instagram/connect?error=${error}`,
        );
      }

      if (!code) {
        throw new BadRequestException('Authorization code is required');
      }

      // Get user's organization ID
      const member = await this.prisma.member.findUnique({
        where: { userId: Number(user.userId) },
        select: { organizationId: true },
      });

      if (!member) {
        throw new BadRequestException('User organization not found');
      }

      // Exchange code for token
      const tokenData = await this.instagramService.exchangeCodeForToken(code);

      // Save Instagram account data
      const expiresAt = tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : undefined;

      await this.instagramService.saveInstagramAccountData(
        member.organizationId,
        tokenData.access_token,
        tokenData.user_id,
        tokenData.username,
        expiresAt,
      );

      // Redirect to frontend success page
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/instagram/connected?success=true`);
    } catch (error) {
      this.instagramService['logger'].error(
        `Error in OAuth callback: ${error.message}`,
        error.stack,
      );
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(
        `${frontendUrl}/instagram/connect?error=callback_failed`,
      );
    }
  }

  /**
   * Handles incoming Instagram webhooks
   * Processes DMs and other events from Instagram
   */
  @Post('webhook')
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary: 'Instagram webhook endpoint',
    description:
      'Receives webhook events from Instagram (DMs, comments, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
  })
  async webhook(@Body() data: any, @Query('hub.mode') mode?: string) {
    try {
      // Handle webhook verification
      if (mode === 'subscribe') {
        return this.instagramService.handleWebhookEvent(data);
      }

      // Process actual webhook events
      return await this.instagramService.handleWebhookEvent(data);
    } catch (error) {
      this.instagramService['logger'].error(
        `Error processing webhook: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Sends a DM reply via Instagram Graph API
   */
  @Post('send-message')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Send Instagram DM',
    description: 'Sends a direct message to an Instagram user',
  })
  @ApiResponse({
    status: 200,
    description: 'Message sent successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or failed to send message',
  })
  @ApiResponse({
    status: 404,
    description: 'Instagram account not found',
  })
  async sendMessage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendMessageDto,
  ) {
    try {
      // Get user's organization ID
      const member = await this.prisma.member.findUnique({
        where: { userId: Number(user.userId) },
        select: { organizationId: true },
      });

      if (!member) {
        throw new BadRequestException('User organization not found');
      }

      // Send message
      const result = await this.instagramService.sendMessage(
        dto.recipientId,
        dto.message,
        member.organizationId,
      );

      return {
        success: true,
        messageId: result.message_id || result.id,
        result,
      };
    } catch (error) {
      this.instagramService['logger'].error(
        `Error sending message: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}

