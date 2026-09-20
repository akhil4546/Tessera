import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminRole } from '@tessera/types';
import { readAdminAccessToken } from '../common/cookies.js';
import { TesseraHttpError } from '../common/http-error.js';
import { TokenService } from '../auth/tokens.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RequestAdmin } from './current-admin.js';

const ROLE_RANK: Record<AdminRole, number> = {
  moderator: 1,
  admin: 2,
  superadmin: 3,
};

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { admin?: RequestAdmin }>();
    const token = readAdminAccessToken(req);
    if (!token) {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to the admin app.');
    }
    const payload = await this.tokens.verifyAdminAccess(token);
    const session = await this.prisma.adminSession.findFirst({
      where: { id: payload.sid, adminId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { admin: true },
    });
    if (!session || session.admin.disabledAt) {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to the admin app.');
    }
    req.admin = {
      id: session.admin.id,
      email: session.admin.email,
      role: session.admin.role,
      sessionId: session.id,
    };
    return true;
  }
}

@Injectable()
export class RequireAdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { admin?: RequestAdmin }>();
    if (!req.admin) {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to the admin app.');
    }
    if (ROLE_RANK[req.admin.role] < ROLE_RANK.admin) {
      throw new TesseraHttpError(403, 'FORBIDDEN', 'That admin action needs the admin role.');
    }
    return true;
  }
}
