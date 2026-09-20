import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AdminAuthSuccess, AdminMe } from '@tessera/types';
import { REFRESH_TTL_DAYS, clearAdminCookies, setAdminCookies } from '../common/cookies.js';
import { randomToken, sha256, verifyPassword } from '../common/crypto.js';
import { TesseraHttpError } from '../common/http-error.js';
import { RateLimitService } from '../common/rate-limit.js';
import { TokenService } from '../auth/tokens.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async login(email: string, password: string, req: Request, res: Response): Promise<AdminAuthSuccess> {
    await this.rateLimit.consume(`admin-login:${req.ip ?? 'unknown'}`, 10, 15 * 60);
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!admin || admin.disabledAt) {
      throw new TesseraHttpError(401, 'INVALID_CREDENTIALS', 'Email or password is wrong.');
    }
    const ok = await verifyPassword(admin.passwordHash, password);
    if (!ok) throw new TesseraHttpError(401, 'INVALID_CREDENTIALS', 'Email or password is wrong.');
    return this.issue(admin.id, req, res);
  }

  async logout(adminId: string, sessionId: string, res: Response): Promise<{ ok: true }> {
    await this.prisma.adminSession.updateMany({
      where: { id: sessionId, adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    clearAdminCookies(res);
    return { ok: true };
  }

  async refresh(refreshToken: string, req: Request, res: Response): Promise<AdminAuthSuccess> {
    const hash = sha256(refreshToken);
    const session = await this.prisma.adminSession.findUnique({
      where: { refreshTokenHash: hash },
      include: { admin: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.admin.disabledAt) {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to the admin app again.');
    }
    await this.prisma.adminSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return this.issue(session.adminId, req, res, session.familyId);
  }

  async me(adminId: string): Promise<AdminMe> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin || admin.disabledAt) throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to the admin app.');
    return { id: admin.id, email: admin.email, displayName: admin.displayName, role: admin.role };
  }

  private async issue(adminId: string, req: Request, res: Response, familyId?: string): Promise<AdminAuthSuccess> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to the admin app.');
    const refresh = randomToken();
    const session = await this.prisma.adminSession.create({
      data: {
        adminId,
        refreshTokenHash: sha256(refresh),
        familyId: familyId ?? randomToken(16),
        userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
        ip: req.ip ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    const access = await this.tokens.signAdminAccess({
      sub: admin.id,
      sid: session.id,
      eml: admin.email,
      role: admin.role,
    });
    setAdminCookies(res, access, refresh);
    return {
      admin: { id: admin.id, email: admin.email, displayName: admin.displayName, role: admin.role },
    };
  }
}

