import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import type { JwtPayload } from '@auth/strategies/jwt.strategy';

/**
 * Gates routes to users with `User.isPlatformAdmin = true`. Use AFTER
 * `JwtAuthGuard` so `req.user` is populated.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: Number(userId) },
      select: { isPlatformAdmin: true },
    });
    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException('Platform admin access required');
    }
    return true;
  }
}
