import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { readAccessToken } from '../common/cookies.js';
import { TesseraHttpError } from '../common/http-error.js';
import type { RequestUser } from './current-user.js';
import { isAccountSuspended, SessionCache } from './session-cache.js';
import { TokenService } from './tokens.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const token = readAccessToken(req);
    if (!token) {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    }
    const payload = await this.tokens.verifyAccess(token);
    const account = await this.sessions.resolve(payload.sid, payload.sub);
    if (!account) {
      throw new TesseraHttpError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    }
    if (isAccountSuspended(account)) {
      throw new TesseraHttpError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended.');
    }
    req.user = { id: payload.sub, handle: payload.hdl, sessionId: payload.sid };
    return true;
  }
}

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const token = readAccessToken(req);
    if (!token) return true;
    try {
      const payload = await this.tokens.verifyAccess(token);
      const account = await this.sessions.resolve(payload.sid, payload.sub);
      if (account) {
        req.user = { id: payload.sub, handle: payload.hdl, sessionId: payload.sid };
      }
    } catch {
      // Invalid tokens on public routes are ignored.
    }
    return true;
  }
}
