import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { mediaIntentSchema } from '@tessera/validation';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser, type RequestUser } from '../auth/current-user.js';
import { TesseraHttpError } from '../common/http-error.js';
import { ZodPipe } from '../common/zod-pipe.js';
import { MediaService } from './media.service.js';

@ApiTags('media')
@Controller('v1/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('intents')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  createIntent(
    @CurrentUser() user: RequestUser,
    @Body(new ZodPipe(mediaIntentSchema)) body: ReturnType<typeof mediaIntentSchema.parse>,
  ) {
    return this.media.createIntent(user.id, body);
  }

  @Post(':id/bytes')
  @UseGuards(AuthGuard)
  @ApiConsumes('application/octet-stream', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4')
  async bytes(@CurrentUser() user: RequestUser, @Param('id') id: string, @Req() req: Request) {
    const existing = req.body;
    let body: Buffer;
    if (Buffer.isBuffer(existing)) {
      body = existing;
    } else {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve());
        req.on('error', reject);
      });
      body = Buffer.concat(chunks);
    }
    await this.media.receiveBytes(user.id, id, body, req.headers['content-type']);
    return { ok: true };
  }

  @Post(':id/complete')
  @UseGuards(AuthGuard)
  complete(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.media.complete(user.id, id);
  }

  @Get('file/:key')
  @Header('Cache-Control', 'private, max-age=60')
  async file(@Param('key') key: string, @Res() res: Response) {
    const decoded = decodeURIComponent(key);
    if (decoded.includes('..')) {
      throw new TesseraHttpError(400, 'VALIDATION', 'Invalid key');
    }
    const file = await this.media.readFile(decoded);
    res.setHeader('Content-Type', file.contentType);
    res.send(file.body);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.media.getOwned(user.id, id);
  }

  @Post(':id/suggest-alt')
  @UseGuards(AuthGuard)
  async suggest(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const result = await this.media.suggestAlt(user.id, id);
    if (result.reason === 'ALT_SUGGEST_NOT_CONFIGURED') {
      throw new TesseraHttpError(
        501,
        'ALT_SUGGEST_NOT_CONFIGURED',
        'Alt-text drafts need XAI_API_KEY. The upload prompt still works without it.',
      );
    }
    return result;
  }
}
