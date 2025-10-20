// import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
// import { UsersService } from './users.service';
// import { ConnectBotDto } from './dto/connect-bot.dto';
// import { JwtAuthGuard } from '@auth/guards/jwt-auth.guard';
// import { CurrentUser } from '@auth/decorators/current-user.decorator';
// import type { JwtPayload } from '@auth/strategies/jwt.strategy';
// import type { Bot } from '@prisma/client';

// @Controller('users')
// @UseGuards(JwtAuthGuard)
// export class UsersController {
//   constructor(private readonly usersService: UsersService) {}

//   @Post('bot')
//   async connectBot(
//     @CurrentUser() user: JwtPayload,
//     @Body() dto: ConnectBotDto,
//   ): Promise<{ success: boolean; bot: { id: number; isEnabled: boolean } }> {
//     const bot: Bot = await this.usersService.connectBot(
//       Number(user.userId),
//       dto,
//     );
//     return {
//       success: true,
//       bot: {
//         id: bot.id,
//         isEnabled: bot.isEnabled,
//       },
//     };
//   }

//   @Get('bot')
//   async getBot(
//     @CurrentUser() user: JwtPayload,
//   ): Promise<{ bot: { id: number; isEnabled: boolean } | null }> {
//     const result = await this.usersService.getBot(Number(user.userId));
//     return {
//       bot: result.bot
//         ? { id: result.bot.id, isEnabled: result.bot.isEnabled }
//         : null,
//     };
//   }

//   @Put('bot/toggle')
//   async toggleBot(
//     @CurrentUser() user: JwtPayload,
//   ): Promise<{ success: boolean; bot: { id: number; isEnabled: boolean } }> {
//     const result = await this.usersService.toggleBotStatus(Number(user.userId));
//     return {
//       success: true,
//       bot: {
//         id: result.bot.id,
//         isEnabled: result.bot.isEnabled,
//       },
//     };
//   }

//   @Put('bot/start')
//   async startBot(
//     @CurrentUser() user: JwtPayload,
//   ): Promise<{ success: boolean; bot: { id: number; isEnabled: boolean } }> {
//     const result = await this.usersService.setBotStatus(
//       Number(user.userId),
//       true,
//     );
//     return {
//       success: true,
//       bot: {
//         id: result.bot.id,
//         isEnabled: result.bot.isEnabled,
//       },
//     };
//   }

//   @Put('bot/stop')
//   async stopBot(
//     @CurrentUser() user: JwtPayload,
//   ): Promise<{ success: boolean; bot: { id: number; isEnabled: boolean } }> {
//     const result = await this.usersService.setBotStatus(
//       Number(user.userId),
//       false,
//     );
//     return {
//       success: true,
//       bot: {
//         id: result.bot.id,
//         isEnabled: result.bot.isEnabled,
//       },
//     };
//   }
// }
