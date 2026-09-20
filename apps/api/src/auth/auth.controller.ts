import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  oauthCompleteSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  totpConfirmSchema,
  totpDisableSchema,
  twoFactorVerifySchema,
  verifyEmailSchema,
} from '@tessera/validation';
import { clearAuthCookies, readRefreshToken, setAuthCookies } from '../common/cookies.js';
import { TesseraHttpError } from '../common/http-error.js';
import { webPublicUrl } from '../common/origins.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, type RequestUser } from './current-user.js';
import {
  appleAuthorizeUrl,
  exchangeAppleCode,
  exchangeGoogleCode,
  googleAuthorizeUrl,
} from './oauth.js';
import { TokenService } from './tokens.js';

function clientOf(value: 'web' | 'mobile' | undefined, fallback: 'web' | 'mobile' = 'web') {
  return value ?? fallback;
}

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(TokenService) private readonly tokens: TokenService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Create an account with email and password' })
  async register(
    @Body(new ZodPipe(registerSchema)) body: ReturnType<typeof registerSchema.parse>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(body, req);
    this.writeSession(res, result, body.client ?? 'web');
    return result;
  }

  @Post('login')
  @ApiOperation({ summary: 'Sign in with email and password' })
  async login(
    @Body(new ZodPipe(loginSchema)) body: ReturnType<typeof loginSchema.parse>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body, req);
    if ('requiresTwoFactor' in result && result.requiresTwoFactor) return result;
    this.writeSession(res, result, body.client ?? 'web');
    return result;
  }

  @Post('2fa/verify')
  @ApiOperation({ summary: 'Finish sign-in with a TOTP or recovery code' })
  async verifyTwoFactor(
    @Body(new ZodPipe(twoFactorVerifySchema)) body: ReturnType<typeof twoFactorVerifySchema.parse>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyTwoFactor(
      body.challengeToken,
      body.code,
      body.recoveryCode,
      clientOf(body.client),
      req,
    );
    this.writeSession(res, result, body.client ?? 'web');
    return result;
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  async logout(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(logoutSchema)) body: ReturnType<typeof logoutSchema.parse>,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(user.id, user.sessionId);
    if ((body.client ?? 'web') === 'web') clearAuthCookies(res);
    return { ok: true };
  }

  @Post('refresh')
  async refresh(
    @Body(new ZodPipe(refreshSchema)) body: ReturnType<typeof refreshSchema.parse>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = readRefreshToken(req, body.refreshToken);
    const client = body.client ?? 'web';
    const result = await this.auth.refresh(token, req, client);
    this.writeSession(res, result, client);
    return result;
  }

  @Post('verify-email')
  async verifyEmail(@Body(new ZodPipe(verifyEmailSchema)) body: ReturnType<typeof verifyEmailSchema.parse>) {
    return { user: await this.auth.verifyEmail(body.token) };
  }

  @Post('resend-verification')
  @UseGuards(AuthGuard)
  async resend(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(resendVerificationSchema)) _body: ReturnType<typeof resendVerificationSchema.parse>,
  ) {
    return this.auth.resendVerification(user.id);
  }

  @Post('forgot-password')
  async forgot(
    @Body(new ZodPipe(forgotPasswordSchema)) body: ReturnType<typeof forgotPasswordSchema.parse>,
    @Req() req: Request,
  ) {
    await this.auth.forgotPassword(body.email, req);
    return { ok: true };
  }

  @Post('reset-password')
  async reset(@Body(new ZodPipe(resetPasswordSchema)) body: ReturnType<typeof resetPasswordSchema.parse>) {
    await this.auth.resetPassword(body.token, body.password);
    return { ok: true };
  }

  @Get('google')
  async google(@Query('client') client: string | undefined, @Res() res: Response) {
    const kind = client === 'mobile' ? 'mobile' : 'web';
    const state = await this.tokens.signOauthState({ purpose: 'oauth', provider: 'google', client: kind });
    return res.redirect(googleAuthorizeUrl(state));
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!code || !state) throw new TesseraHttpError(400, 'OAUTH_FAILED', 'Google sign-in failed.');
    const parsed = await this.tokens.verifyOauthState(state);
    const profile = await exchangeGoogleCode(code);
    const result = await this.auth.finishOauth(profile, req, parsed.client);
    return this.finishOauthRedirect(res, result, parsed.client);
  }

  @Get('apple')
  async apple(@Query('client') client: string | undefined, @Res() res: Response) {
    const kind = client === 'mobile' ? 'mobile' : 'web';
    const state = await this.tokens.signOauthState({ purpose: 'oauth', provider: 'apple', client: kind });
    return res.redirect(appleAuthorizeUrl(state));
  }

  @Post('apple/callback')
  async appleCallback(
    @Body() body: { code?: string; state?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!body.code || !body.state) throw new TesseraHttpError(400, 'OAUTH_FAILED', 'Apple sign-in failed.');
    const parsed = await this.tokens.verifyOauthState(body.state);
    const profile = await exchangeAppleCode(body.code);
    const result = await this.auth.finishOauth(profile, req, parsed.client);
    return this.finishOauthRedirect(res, result, parsed.client);
  }

  @Post('oauth/complete')
  async oauthComplete(
    @Body(new ZodPipe(oauthCompleteSchema)) body: ReturnType<typeof oauthCompleteSchema.parse>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.completeOauth(body.setupToken, body, req);
    this.writeSession(res, result, body.client ?? 'web');
    return result;
  }

  @Post('2fa/setup')
  @UseGuards(AuthGuard)
  async setupTotp(@CurrentUser() user: RequestUser) {
    return this.auth.setupTotp(user.id, user.handle);
  }

  @Post('2fa/confirm')
  @UseGuards(AuthGuard)
  async confirmTotp(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(totpConfirmSchema)) body: ReturnType<typeof totpConfirmSchema.parse>,
  ) {
    return this.auth.confirmTotp(user.id, body.code);
  }

  @Post('2fa/disable')
  @UseGuards(AuthGuard)
  async disableTotp(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(totpDisableSchema)) body: ReturnType<typeof totpDisableSchema.parse>,
  ) {
    await this.auth.disableTotp(user.id, body.password, body.code);
    return { ok: true };
  }

  private writeSession(
    res: Response,
    result: { accessToken?: string; refreshToken?: string; expiresIn?: number },
    client: 'web' | 'mobile',
  ) {
    if (client !== 'web') return;
    if (result.accessToken && result.refreshToken) {
      setAuthCookies(res, result.accessToken, result.refreshToken);
    }
    delete result.accessToken;
    delete result.refreshToken;
    delete result.expiresIn;
  }

  private finishOauthRedirect(
    res: Response,
    result: Awaited<ReturnType<AuthService['finishOauth']>>,
    client: 'web' | 'mobile',
  ) {
    const web = webPublicUrl();
    if ('needsProfile' in result && result.needsProfile) {
      if (client === 'mobile') {
        return res.json(result);
      }
      return res.redirect(`${web}/signup/complete?setup=${encodeURIComponent(result.setupToken)}`);
    }
    if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
      if (client === 'mobile') return res.json(result);
      return res.redirect(`${web}/login?challenge=${encodeURIComponent(result.challengeToken)}`);
    }
    if (client === 'web' && 'accessToken' in result && result.accessToken && result.refreshToken) {
      setAuthCookies(res, result.accessToken, result.refreshToken);
      return res.redirect(`${web}/me`);
    }
    if (client === 'mobile') return res.json(result);
    return res.redirect(`${web}/me`);
  }
}
