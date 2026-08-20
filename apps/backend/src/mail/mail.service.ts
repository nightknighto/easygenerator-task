import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.getOrThrow<string>('SMTP_HOST');
    const port = Number(config.getOrThrow<string | number>('SMTP_PORT'));
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
    this.from = config.getOrThrow<string>('SMTP_FROM');
  }

  async sendSignupLink(to: string, link: string): Promise<void> {
    // Always surface the link on the console — demo convenience, so the flow
    // can be walked even without opening MailPit.
    this.logger.log(`Signup link for ${to}: ${link}`);

    const subject = 'Complete your sign up';
    const text = [
      'Welcome!',
      '',
      'Use the link below to complete your sign up (valid for 1 hour):',
      link,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n');
    const html = `<p>Welcome!</p><p>Use the link below to complete your sign up (valid for 1 hour):</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can safely ignore this email.</p>`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text,
        html,
      });
    } catch (error) {
      // A broken SMTP must not leak whether the address can sign up — the
      // request still returns the generic message; the error is logged here.
      this.logger.error(
        `Failed to send signup email to ${to}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
