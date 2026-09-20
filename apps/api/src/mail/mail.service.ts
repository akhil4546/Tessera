import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { webPublicUrl } from '../common/origins.js';

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  private getTransport(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'localhost',
        port: Number(process.env.SMTP_PORT ?? 1025),
        secure: false,
      });
    }
    return this.transporter;
  }

  private from(): string {
    return process.env.SMTP_FROM ?? 'Tessera <noreply@localhost>';
  }

  async send(options: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
    try {
      await this.getTransport().sendMail({ from: this.from(), ...options });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.log.warn(`SOFT-FAIL: email not sent (${message}).`);
      return false;
    }
  }

  async sendVerifyEmail(to: string, token: string): Promise<boolean> {
    const url = `${webPublicUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    if (process.env.NODE_ENV !== 'production') {
      this.log.log(`Dev verify-email link for ${to}: ${url}`);
    }
    return this.send({
      to,
      subject: 'Confirm your Tessera email',
      text: `Confirm your email by opening this link:\n${url}\n`,
      html: `<p>Confirm your email by opening this link:</p><p><a href="${url}">${url}</a></p>`,
    });
  }

  async sendActivity(to: string, subject: string, body: string, href: string | null): Promise<boolean> {
    const url = href ? `${webPublicUrl()}${href}` : webPublicUrl();
    return this.send({
      to,
      subject,
      text: `${body}\n\n${url}\n`,
      html: `<p>${escapeHtml(body)}</p><p><a href="${url}">Open in Tessera</a></p>`,
    });
  }

  async sendSecurityAlert(to: string, body: string): Promise<boolean> {
    const url = `${webPublicUrl()}/settings/security`;
    return this.send({
      to,
      subject: 'Tessera security alert',
      text: `${body}\n\nIf this was not you, open ${url} and review your sessions.\n`,
      html: `<p>${escapeHtml(body)}</p><p><a href="${url}">Review security settings</a></p>`,
    });
  }

  async sendActivityDigest(to: string, lines: string[]): Promise<boolean> {
    if (lines.length === 0) return true;
    const text = `Here is what you missed:\n\n${lines.map((line) => `• ${line}`).join('\n')}\n\n${webPublicUrl()}/inbox\n`;
    const html = `<p>Here is what you missed:</p><ul>${lines
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join('')}</ul><p><a href="${webPublicUrl()}/inbox">Open Inbox</a></p>`;
    return this.send({
      to,
      subject: 'Your Tessera Inbox digest',
      text,
      html,
    });
  }

  async sendExportReady(to: string, downloadUrl: string): Promise<boolean> {
    return this.send({
      to,
      subject: 'Your Tessera data export is ready',
      text: `Your archive is ready (JSON plus media). It expires in 7 days:\n${downloadUrl}\n`,
      html: `<p>Your archive is ready (JSON plus media). It expires in 7 days.</p><p><a href="${downloadUrl}">Download export</a></p>`,
    });
  }

  async sendPasswordReset(to: string, token: string): Promise<boolean> {
    const url = `${webPublicUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    if (process.env.NODE_ENV !== 'production') {
      this.log.log(`Dev reset-password link for ${to}: ${url}`);
    }
    return this.send({
      to,
      subject: 'Reset your Tessera password',
      text: `Reset your password by opening this link (it expires in an hour):\n${url}\n`,
      html: `<p>Reset your password (link expires in an hour):</p><p><a href="${url}">${url}</a></p>`,
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
