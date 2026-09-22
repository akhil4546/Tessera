import { Global, Module } from '@nestjs/common';
import { RateLimitService } from '../common/rate-limit.js';
import { AuthGuard, OptionalAuthGuard } from './auth.guard.js';
import { SessionCache } from './session-cache.js';
import { TokenService } from './tokens.js';

@Global()
@Module({
  providers: [TokenService, SessionCache, AuthGuard, OptionalAuthGuard, RateLimitService],
  exports: [TokenService, SessionCache, AuthGuard, OptionalAuthGuard, RateLimitService],
})
export class AuthCoreModule {}
