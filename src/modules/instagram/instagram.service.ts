import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/core/prisma/prisma.service';
import { EncryptionService } from '@/core/encryption/encryption.service';

/**
 * Instagram Service
 * Handles Instagram OAuth, token management, webhook processing, and message sending
 */
@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly graphApiBaseUrl = 'https://graph.facebook.com/v21.0';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
  ) {
    this.appId = this.configService.get<string>('INSTAGRAM_APP_ID') || '';
    this.appSecret = this.configService.get<string>('INSTAGRAM_APP_SECRET') || '';
    this.redirectUri =
      this.configService.get<string>('INSTAGRAM_REDIRECT_URI') || '';

    if (!this.appId || !this.appSecret || !this.redirectUri) {
      this.logger.warn(
        'Instagram credentials not fully configured. Please set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and INSTAGRAM_REDIRECT_URI in .env',
      );
    }
  }

  /**
   * Generates Instagram OAuth authorization URL
   * @returns OAuth URL for user to authorize the app
   */
  getAuthUrl(): string {
    if (!this.appId || !this.redirectUri) {
      throw new BadRequestException(
        'Instagram OAuth not configured. Please contact administrator.',
      );
    }

    const scopes = [
      'instagram_basic',
      'instagram_manage_messages',
      'pages_show_list',
      'pages_read_engagement',
    ].join(',');

    const state = this.generateState();
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: scopes,
      response_type: 'code',
      state: state,
    });

    const authUrl = `https://api.instagram.com/oauth/authorize?${params.toString()}`;
    console.log(authUrl);
    this.logger.log(`Generated OAuth URL with state: ${state}`);
    return authUrl;
  }

  /**
   * Exchanges authorization code for access token
   * @param code - Authorization code from Instagram OAuth callback
   * @returns Access token and user information
   */
  async exchangeCodeForToken(code: string): Promise<{
    access_token: string;
    user_id: string;
    username?: string;
    expires_in?: number;
  }> {
    if (!this.appId || !this.appSecret || !this.redirectUri) {
      throw new BadRequestException('Instagram OAuth not configured');
    }

    try {
      this.logger.log('Exchanging authorization code for access token');

      // Exchange code for short-lived access token
      const tokenUrl = `${this.graphApiBaseUrl}/oauth/access_token`;
      const tokenParams = new URLSearchParams({
        client_id: this.appId,
        client_secret: this.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
        code: code,
      });

      const tokenResponse = await fetch(`${tokenUrl}?${tokenParams.toString()}`, {
        method: 'GET',
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        this.logger.error(
          `Failed to exchange code for token: ${tokenResponse.status} ${errorText}`,
        );
        throw new BadRequestException(
          'Failed to exchange authorization code for token',
        );
      }

      const tokenData = await tokenResponse.json();

      if (!tokenData.access_token || !tokenData.user_id) {
        this.logger.error('Invalid token response structure', tokenData);
        throw new BadRequestException('Invalid token response from Instagram');
      }

      this.logger.log(
        `Successfully exchanged code for token. User ID: ${tokenData.user_id}`,
      );

      let expiresIn: number | undefined;

      // Get long-lived token (optional but recommended)
      // Instagram access tokens can be exchanged for long-lived tokens (60 days)
      try {
        const longLivedToken = await this.getLongLivedToken(
          tokenData.access_token,
        );
        tokenData.access_token = longLivedToken.access_token;
        expiresIn = longLivedToken.expires_in;
      } catch (error) {
        this.logger.warn(
          'Failed to exchange for long-lived token, using short-lived token',
          error,
        );
        // Short-lived tokens typically expire in 1 hour (3600 seconds)
        expiresIn = tokenData.expires_in || 3600;
      }

      // Get Instagram user information
      let username: string | undefined;
      try {
        const userInfo = await this.getInstagramUserInfo(
          tokenData.user_id,
          tokenData.access_token,
        );
        username = userInfo.username;
      } catch (error) {
        this.logger.warn('Failed to fetch Instagram username', error);
      }

      return {
        access_token: tokenData.access_token,
        user_id: tokenData.user_id,
        username,
        expires_in: expiresIn,
      };
    } catch (error) {
      this.logger.error(
        `Error exchanging code for token: ${error.message}`,
        error.stack,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to process Instagram authorization',
      );
    }
  }

  /**
   * Exchanges short-lived token for long-lived token (60 days)
   * @param shortLivedToken - Short-lived access token
   * @returns Long-lived token information
   */
  private async getLongLivedToken(shortLivedToken: string): Promise<{
    access_token: string;
    expires_in?: number;
  }> {
    const url = `${this.graphApiBaseUrl}/oauth/access_token`;
    const params = new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: this.appSecret,
      access_token: shortLivedToken,
    });

    const response = await fetch(`${url}?${params.toString()}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get long-lived token: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Gets Instagram user information
   * @param userId - Instagram user ID
   * @param accessToken - Access token
   * @returns User information including username
   */
  private async getInstagramUserInfo(
    userId: string,
    accessToken: string,
  ): Promise<{ username: string; account_type?: string }> {
    const url = `${this.graphApiBaseUrl}/${userId}`;
    const params = new URLSearchParams({
      fields: 'username,account_type',
      access_token: accessToken,
    });

    const response = await fetch(`${url}?${params.toString()}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get user info: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Saves Instagram account data for an organization
   * @param organizationId - Organization ID
   * @param token - Access token (will be encrypted)
   * @param instagramUserId - Instagram user ID
   * @param instagramUsername - Instagram username (optional)
   * @param tokenExpiresAt - Token expiration date (optional)
   * @returns Created or updated Instagram account
   */
  async saveInstagramAccountData(
    organizationId: number,
    token: string,
    instagramUserId: string,
    instagramUsername?: string,
    tokenExpiresAt?: Date,
  ) {
    try {
      this.logger.log(
        `Saving Instagram data for org ${organizationId}, IG user ${instagramUserId}`,
      );

      // Encrypt the access token before saving
      const encryptedToken = this.encryptionService.encrypt(token);

      // Check if account already exists for this organization
      const existingAccount = await this.prisma.instagramAccount.findFirst({
        where: {
          organizationId,
          instagramUserId,
        },
      });

      if (existingAccount) {
        // Update existing account
        const updated = await this.prisma.instagramAccount.update({
          where: {
            id: existingAccount.id,
          },
          data: {
            accessTokenEncrypted: encryptedToken,
            instagramUsername: instagramUsername || existingAccount.instagramUsername,
            tokenExpiresAt,
            updatedAt: new Date(),
          },
        });

        this.logger.log(
          `Updated Instagram account ${updated.id} for org ${organizationId}`,
        );
        return updated;
      } else {
        // Create new account
        const created = await this.prisma.instagramAccount.create({
          data: {
            organizationId,
            instagramUserId,
            instagramUsername,
            accessTokenEncrypted: encryptedToken,
            tokenExpiresAt,
          },
        });

        this.logger.log(
          `Created Instagram account ${created.id} for org ${organizationId}`,
        );
        return created;
      }
    } catch (error) {
      this.logger.error(
        `Error saving Instagram data: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to save Instagram account data',
      );
    }
  }

  /**
   * Gets decrypted access token for an Instagram account
   * @param instagramUserId - Instagram user ID
   * @param organizationId - Organization ID (for security)
   * @returns Decrypted access token
   */
  async getDecryptedToken(
    instagramUserId: string,
    organizationId: number,
  ): Promise<string> {
    const account = await this.prisma.instagramAccount.findFirst({
      where: {
        instagramUserId,
        organizationId,
      },
    });

    if (!account) {
      throw new NotFoundException('Instagram account not found');
    }

    try {
      return this.encryptionService.decrypt(account.accessTokenEncrypted);
    } catch (error) {
      this.logger.error(
        `Error decrypting token for account ${account.id}: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to decrypt access token');
    }
  }

  /**
   * Handles incoming Instagram webhook events (DMs, comments, etc.)
   * @param data - Webhook payload from Instagram
   * @returns Processing result
   */
  async handleWebhookEvent(data: any): Promise<{ status: string; message?: string }> {
    try {
      this.logger.log('Processing Instagram webhook event', JSON.stringify(data));

      // Instagram webhook verification (for initial setup)
      if (data['hub.mode'] === 'subscribe' && data['hub.verify_token']) {
        const verifyToken = this.configService.get<string>('INSTAGRAM_WEBHOOK_VERIFY_TOKEN');
        if (data['hub.verify_token'] === verifyToken) {
          this.logger.log('Webhook verification successful');
          return {
            status: 'verified',
            message: data['hub.challenge'] || '',
          };
        } else {
          this.logger.warn('Webhook verification failed: invalid token');
          throw new BadRequestException('Invalid verify token');
        }
      }

      // Process actual webhook events
      if (data.entry && Array.isArray(data.entry)) {
        for (const entry of data.entry) {
          // Handle messaging events (DMs)
          if (entry.messaging && Array.isArray(entry.messaging)) {
            for (const messageEvent of entry.messaging) {
              await this.processMessageEvent(messageEvent);
            }
          }

          // Handle other event types can be added here
          // e.g., comments, mentions, story replies, etc.
        }
      }

      return { status: 'processed' };
    } catch (error) {
      this.logger.error(
        `Error handling webhook event: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to process webhook event');
    }
  }

  /**
   * Processes individual message event from Instagram
   * @param messageEvent - Message event from Instagram webhook
   */
  private async processMessageEvent(messageEvent: any): Promise<void> {
    try {
      const senderId = messageEvent.sender?.id;
      const recipientId = messageEvent.recipient?.id;
      const message = messageEvent.message;

      if (!senderId || !message) {
        this.logger.warn('Invalid message event structure', messageEvent);
        return;
      }

      this.logger.log(
        `Processing message from sender ${senderId} to recipient ${recipientId}`,
      );

      // Find Instagram account by recipientId (Instagram user ID)
      const account = await this.prisma.instagramAccount.findUnique({
        where: {
          instagramUserId: recipientId,
        },
      });

      if (!account) {
        this.logger.warn(
          `No Instagram account found for recipient ${recipientId}`,
        );
        return;
      }

      // Extract message content
      const messageText = message.text || '';
      const messageId = message.mid;

      this.logger.log(
        `Received DM from ${senderId}: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"`,
      );

      // TODO: Save message to database, trigger AI response, etc.
      // This will be implemented in future steps when connecting to the messaging system
    } catch (error) {
      this.logger.error(
        `Error processing message event: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Sends a DM reply via Instagram Graph API
   * @param recipientId - Instagram user ID of the recipient
   * @param message - Message text to send
   * @param organizationId - Organization ID (for security)
   * @returns API response
   */
  async sendMessage(
    recipientId: string,
    message: string,
    organizationId: number,
  ): Promise<any> {
    try {
      this.logger.log(
        `Sending message to ${recipientId} from organization ${organizationId}`,
      );

      // Find Instagram account for this organization
      // Note: In a real scenario, you might want to specify which Instagram account to use
      const account = await this.prisma.instagramAccount.findFirst({
        where: {
          organizationId,
        },
      });

      if (!account) {
        throw new NotFoundException(
          'No Instagram account found for this organization',
        );
      }

      // Decrypt access token
      const accessToken = await this.getDecryptedToken(
        account.instagramUserId,
        organizationId,
      );

      // Send message via Graph API
      // Note: Instagram requires the recipient to have messaged you first (for DMs)
      const url = `${this.graphApiBaseUrl}/${account.instagramUserId}/messages`;
      const payload = {
        recipient: {
          id: recipientId,
        },
        message: {
          text: message,
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          access_token: accessToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Failed to send message: ${response.status} ${errorText}`,
        );
        throw new BadRequestException(
          `Failed to send message: ${errorText}`,
        );
      }

      const result = await response.json();
      this.logger.log(`Message sent successfully: ${result.message_id || 'N/A'}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error sending message: ${error.message}`,
        error.stack,
      );
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to send message');
    }
  }

  /**
   * Generates a random state string for OAuth
   * @returns Random state string
   */
  private generateState(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

}

