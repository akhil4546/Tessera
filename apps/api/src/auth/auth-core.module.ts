import { Global, Module } from '@nestjs/common';
import { RateLimitService } from '../common/rate-limit.js';
import { AuthGuard, OptionalAuthGuard } from './auth.guard.js';
import { TokenService } from './tokens.js';

@Global()
@Module({
  providers: [TokenService, AuthGuard, OptionalAuthGuard, RateLimitService],
  exports: [TokenService, AuthGuard, OptionalAuthGuard, RateLimitService],
})
export class AuthCoreModule {}
