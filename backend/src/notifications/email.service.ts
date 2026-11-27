import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmailMessage {
  to: { email: string; name?: string };
  subject: string;
  html: string;
}

interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/** Used when no email provider is configured (local development). */
class LogEmailProvider implements EmailProvider {
  private readonly log = new Logger('Email');
  send(m: EmailMessage): Promise<void> {
    this.log.log(
      `[not sent, no provider configured] to=${m.to.email} subject="${m.subject}"`,
    );
    return Promise.resolve();
  }
}

class BrevoEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly sender: { email: string; name: string },
  ) {}

  async send(m: EmailMessage): Promise<void> {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      // Brevo takes one body type per request: htmlContent here
      body: JSON.stringify({
        sender: this.sender,
        to: [m.to],
        subject: m.subject,
        htmlContent: m.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(
        `Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
  }
}

@Injectable()
export class EmailService {
  private readonly provider: EmailProvider;

  constructor(config: ConfigService) {
    const key = config.get<string>('BREVO_API_KEY');
    const from = config.get<string>('EMAIL_FROM_ADDRESS');
    if (key && from) {
      this.provider = new BrevoEmailProvider(key, {
        email: from,
        name: config.get<string>('EMAIL_FROM_NAME') ?? 'LocalVoice AI',
      });
    } else {
      this.provider = new LogEmailProvider();
      new Logger(EmailService.name).warn(
        'BREVO_API_KEY / EMAIL_FROM_ADDRESS not set: emails are logged, not sent',
      );
    }
  }

  send(message: EmailMessage): Promise<void> {
    return this.provider.send(message);
  }
}
