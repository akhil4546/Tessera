import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import {
  ageOn,
  isMinorAge,
  parseIsoDateOnly,
  type LoginInput,
  type RegisterInput,
} from '@tessera/validation';
import type { AuthResult, AuthSuccess, MeProfile } from '@tessera/types';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_DAYS } from '../common/cookies.js';
import {
  hashPassword,
  randomRecoveryCode,
  randomToken,
  sha256,
  verifyPassword,
} from '../common/crypto.js';
import { TesseraHttpError } from '../common/http-error.js';
import { RateLimitService } from '../common/rate-limit.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UsersService } from '../users/users.service.js';
import type { OauthProfile } from './oauth.js';
import { SessionCache } from './session-cache.js';
import { inspectRefreshSession } from './session.rules.js';
import { TokenService } from './tokens.js';
import { generateTotpSecret, totpOtpauthUrl, verifyTotp } from './totp.js';

type ClientKind = 'web' | 'mobile';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly rateLimit: RateLimitService,
    private readonly notifications: NotificationsService,
    private readonly sessions: SessionCache,
  ) {}

  async register(input: RegisterInput, req: Request): Promise<AuthSuccess> {
    await this.rateLimit.consume(`register:${this.ip(req)}`, 5, 60 * 60);
    const email = input.email;
    const handle = input.handle;
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { handle }] },
    });
    if (existing?.email === email) {
      throw new TesseraHttpError(409, 'EMAIL_TAKEN', 'That email is already registered.');
    }
    if (existing?.handle === handle) {
      throw new TesseraHttpError(409, 'HANDLE_TAKEN', 'That handle is taken.');
    }
    const dob = parseIsoDateOnly(input.dateOfBirth);
    const age = ageOn(dob);
    const minor = isMinorAge(age);
    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        handle,
        dateOfBirth: dob,
        isMinor: minor,
        handleChangedAt: null,
        profile: {
          create: {
            displayName: input.displayName,
            isPrivate: minor,
            whoCanMessage: minor ? 'followers' : 'everyone',
          },
        },
      },
      include: { profile: true, totp: true },
    });
    await this.issueEmailToken(user.id, 'verify_email', email);
    return this.issueSession(user.id, req, input.client ?? 'web');
  }

  async login(input: LoginInput, req: Request): Promise<AuthResult> {
    await this.rateLimit.consume(`login:${this.ip(req)}`, 10, 15 * 60);
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { totp: true },
    });
    if (!user?.passwordHash) {
      throw new TesseraHttpError(401, 'INVALID_CREDENTIALS', 'Email or password is wrong.');
    }
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) {
      throw new TesseraHttpError(401, 'INVALID_CREDENTIALS', 'Email or password is wrong.');
    }
    await this.assertAccountUsable(user);
    if (user.totp?.enabledAt) {
      return { requiresTwoFactor: true, challengeToken: await this.tokens.signChallenge(user.id) };
    }
    return this.issueSession(user.id, req, input.client ?? 'web');
  }

  async verifyTwoFactor(
    challengeToken: string,
    code: string | undefined,
    recoveryCode: string | undefined,
    client: ClientKind,
    req: Request,
  ): Promise<AuthSuccess> {
    const userId = await this.tokens.verifyChallenge(challengeToken);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { totp: true, recoveryCodes: true },
    });
    if (!user?.totp?.enabledAt) {
      throw new TesseraHttpError(400, '2FA_NOT_ENABLED', 'Two-factor authentication is not enabled.');
    }
    if (code) {
      if (!verifyTotp(user.totp.secretEncrypted, code)) {
        throw new TesseraHttpError(401, 'INVALID_CODE', 'That code is not valid.');
      }
    } else if (recoveryCode) {
      const hash = sha256(recoveryCode.toLowerCase());
      const match = user.recoveryCodes.find((row) => row.codeHash === hash && !row.usedAt);
      if (!match) {
        throw new TesseraHttpError(401, 'INVALID_CODE', 'That recovery code is not valid.');
      }
      await this.prisma.recoveryCode.update({
        where: { id: match.id },
        data: { usedAt: new Date() },
      });
    } else {
      throw new TesseraHttpError(400, 'VALIDATION', 'Enter a code or a recovery code.');
    }
    return this.issueSession(user.id, req, client);
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.sessions.revokeWhere({ id: sessionId, userId }, 'session');
  }

  async refresh(refreshToken: string | undefined, req: Request, client: ClientKind): Promise<AuthSuccess> {
    if (!refreshToken) {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in again.');
    }
    const hash = sha256(refreshToken);
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });
    if (!session) {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in again.');
    }
    const decision = inspectRefreshSession(session);
    if (decision === 'reuse') {
      await this.sessions.revokeWhere({ familyId: session.familyId }, 'user', session.userId);
      throw new TesseraHttpError(401, 'TOKEN_REUSE', 'That refresh token was already used. Sign in again.');
    }
    if (decision !== 'ok') {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in again.');
    }
    const next = await this.createSessionRow(session.userId, req, session.familyId);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { replacedById: next.sessionId, revokedAt: new Date() },
    });
    await this.sessions.invalidateSessions([session.id]);
    const user = await this.users.getMe(session.userId);
    return this.bundle(user, next.accessToken, next.refreshToken, client);
  }

  async verifyEmail(token: string): Promise<MeProfile> {
    const row = await this.consumeEmailToken(token, 'verify_email');
    await this.prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() },
    });
    return this.users.getMe(row.userId);
  }

  async resendVerification(userId: string): Promise<{ emailSent: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    if (user.emailVerifiedAt) return { emailSent: true };
    const sent = await this.issueEmailToken(user.id, 'verify_email', user.email);
    return { emailSent: sent };
  }

  async forgotPassword(email: string, req: Request): Promise<void> {
    await this.rateLimit.consume(`forgot:${this.ip(req)}`, 5, 60 * 60);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) return;
    await this.issueEmailToken(user.id, 'reset_password', user.email);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const row = await this.consumeEmailToken(token, 'reset_password');
    const passwordHash = await hashPassword(password);
    const live = await this.prisma.session.findMany({
      where: { userId: row.userId, revokedAt: null },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.sessions.invalidateSessions(live.map((session) => session.id));
    await this.sessions.invalidateUser(row.userId);
    await this.notifications.notify({
      recipientId: row.userId,
      kind: 'security_alert',
      targetType: 'security',
      securityKind: 'password_changed',
      unique: row.id,
    });
  }

  async setupTotp(userId: string, handle: string): Promise<{ otpauthUrl: string; secret: string }> {
    const existing = await this.prisma.totpSecret.findUnique({ where: { userId } });
    if (existing?.enabledAt) {
      throw new TesseraHttpError(409, '2FA_ENABLED', 'Two-factor authentication is already on.');
    }
    const generated = generateTotpSecret();
    const otpauthUrl = totpOtpauthUrl(generated.secret, handle);
    await this.prisma.totpSecret.upsert({
      where: { userId },
      create: { userId, secretEncrypted: generated.encrypted },
      update: { secretEncrypted: generated.encrypted, enabledAt: null },
    });
    return { otpauthUrl, secret: generated.secret };
  }

  async confirmTotp(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const totp = await this.prisma.totpSecret.findUnique({ where: { userId } });
    if (!totp) throw new TesseraHttpError(400, '2FA_NOT_STARTED', 'Start two-factor setup first.');
    if (totp.enabledAt) throw new TesseraHttpError(409, '2FA_ENABLED', 'Two-factor authentication is already on.');
    if (!verifyTotp(totp.secretEncrypted, code)) {
      throw new TesseraHttpError(401, 'INVALID_CODE', 'That code is not valid.');
    }
    const codes = Array.from({ length: 10 }, () => randomRecoveryCode());
    await this.prisma.$transaction([
      this.prisma.totpSecret.update({
        where: { userId },
        data: { enabledAt: new Date() },
      }),
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.createMany({
        data: codes.map((codeValue) => ({ userId, codeHash: sha256(codeValue.toLowerCase()) })),
      }),
    ]);
    await this.notifications.notify({
      recipientId: userId,
      kind: 'security_alert',
      targetType: 'security',
      securityKind: 'totp_enabled',
      unique: totp.id,
    });
    return { recoveryCodes: codes };
  }

  async disableTotp(userId: string, password: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { totp: true },
    });
    if (!user?.passwordHash) {
      throw new TesseraHttpError(400, 'PASSWORD_REQUIRED', 'Set a password before turning off two-factor.');
    }
    if (!user.totp?.enabledAt) {
      throw new TesseraHttpError(400, '2FA_NOT_ENABLED', 'Two-factor authentication is not enabled.');
    }
    if (!(await verifyPassword(user.passwordHash, password)) || !verifyTotp(user.totp.secretEncrypted, code)) {
      throw new TesseraHttpError(401, 'INVALID_CREDENTIALS', 'Password or code is wrong.');
    }
    await this.prisma.$transaction([
      this.prisma.totpSecret.delete({ where: { userId } }),
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
    ]);
    await this.notifications.notify({
      recipientId: userId,
      kind: 'security_alert',
      targetType: 'security',
      securityKind: 'totp_disabled',
      unique: `off-${Date.now()}`,
    });
  }

  async finishOauth(profile: OauthProfile, req: Request, client: ClientKind): Promise<AuthResult | { needsProfile: true; setupToken: string }> {
    const linked = await this.prisma.oauthAccount.findUnique({
      where: {
        provider_providerAccountId: { provider: profile.provider, providerAccountId: profile.providerAccountId },
      },
    });
    if (linked) {
      return this.issueSession(linked.userId, req, client);
    }
    const byEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      await this.prisma.oauthAccount.create({
        data: {
          userId: byEmail.id,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      });
      if (!byEmail.emailVerifiedAt) {
        await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { emailVerifiedAt: new Date() },
        });
      }
      const totp = await this.prisma.totpSecret.findUnique({ where: { userId: byEmail.id } });
      if (totp?.enabledAt) {
        return { requiresTwoFactor: true, challengeToken: await this.tokens.signChallenge(byEmail.id) };
      }
      return this.issueSession(byEmail.id, req, client);
    }
    const setupToken = await this.tokens.signOauthSetup({
      purpose: 'oauth-setup',
      provider: profile.provider,
      providerAccountId: profile.providerAccountId,
      email: profile.email,
      name: profile.name,
    });
    return { needsProfile: true, setupToken };
  }

  async completeOauth(
    setupToken: string,
    input: { handle: string; displayName: string; dateOfBirth: string; client?: ClientKind },
    req: Request,
  ): Promise<AuthSuccess> {
    const setup = await this.tokens.verifyOauthSetup(setupToken);
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: setup.email }, { handle: input.handle }] },
    });
    if (existing?.email === setup.email) {
      throw new TesseraHttpError(409, 'EMAIL_TAKEN', 'That email is already registered.');
    }
    if (existing?.handle === input.handle) {
      throw new TesseraHttpError(409, 'HANDLE_TAKEN', 'That handle is taken.');
    }
    const dob = parseIsoDateOnly(input.dateOfBirth);
    const minor = isMinorAge(ageOn(dob));
    const user = await this.prisma.user.create({
      data: {
        email: setup.email,
        handle: input.handle,
        dateOfBirth: dob,
        isMinor: minor,
        emailVerifiedAt: new Date(),
        profile: {
          create: {
            displayName: input.displayName,
            isPrivate: minor,
            whoCanMessage: minor ? 'followers' : 'everyone',
          },
        },
        oauthAccounts: {
          create: {
            provider: setup.provider,
            providerAccountId: setup.providerAccountId,
          },
        },
      },
    });
    return this.issueSession(user.id, req, input.client ?? 'web');
  }

  private async assertAccountUsable(user: {
    id: string;
    suspendedAt: Date | null;
    suspensionEndsAt: Date | null;
    deactivatedAt: Date | null;
  }): Promise<void> {
    if (user.suspendedAt) {
      if (!user.suspensionEndsAt || user.suspensionEndsAt > new Date()) {
        throw new TesseraHttpError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended.');
      }
      await this.prisma.user.update({
        where: { id: user.id },
        data: { suspendedAt: null, suspendReason: null, suspensionEndsAt: null },
      });
    }
    if (user.deactivatedAt) {
      const pending = await this.prisma.deletionRequest.findFirst({
        where: { userId: user.id, status: 'pending' },
      });
      if (!pending) {
        throw new TesseraHttpError(403, 'ACCOUNT_DEACTIVATED', 'This account is deactivated.');
      }
    }
  }

  async issueSession(userId: string, req: Request, client: ClientKind): Promise<AuthSuccess> {
    const created = await this.createSessionRow(userId, req);
    const user = await this.users.getMe(userId);
    return this.bundle(user, created.accessToken, created.refreshToken, client);
  }

  private bundle(user: MeProfile, accessToken: string, refreshToken: string, _client: ClientKind): AuthSuccess {
    return { user, accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
  }

  private async createSessionRow(userId: string, req: Request, familyId = randomToken(16)) {
    const refreshToken = randomToken(32);
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: sha256(refreshToken),
        familyId,
        userAgent: req.headers['user-agent']?.slice(0, 512) ?? null,
        ip: this.ip(req).slice(0, 64),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    const accessToken = await this.tokens.signAccess({
      sub: userId,
      sid: session.id,
      hdl: (await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { handle: true } })).handle,
    });
    return { sessionId: session.id, accessToken, refreshToken };
  }

  private async issueEmailToken(
    userId: string,
    type: 'verify_email' | 'reset_password',
    email: string,
  ): Promise<boolean> {
    const token = randomToken(32);
    const ttlMs = type === 'reset_password' ? 60 * 60 * 1000 : 48 * 60 * 60 * 1000;
    await this.prisma.emailToken.updateMany({
      where: { userId, type, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await this.prisma.emailToken.create({
      data: {
        userId,
        type,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    if (type === 'verify_email') return this.mail.sendVerifyEmail(email, token);
    return this.mail.sendPasswordReset(email, token);
  }

  private async consumeEmailToken(token: string, type: 'verify_email' | 'reset_password') {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.type !== type || row.consumedAt || row.expiresAt <= new Date()) {
      throw new TesseraHttpError(400, 'TOKEN_INVALID', 'That link is invalid or has expired.');
    }
    await this.prisma.emailToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
    return row;
  }

  private ip(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]!.trim();
    }
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
  }
}
