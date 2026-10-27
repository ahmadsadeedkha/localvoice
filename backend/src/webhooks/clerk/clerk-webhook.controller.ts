import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  InternalServerErrorException,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Request } from 'express';
import { Webhook } from 'svix';
import { Public } from '../../auth/decorators';
import { ClerkEvent, ClerkWebhookService } from './clerk-webhook.service';

@Controller('webhooks/clerk')
export class ClerkWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly service: ClerkWebhookService,
  ) {}

  // Public on purpose: Clerk cannot send a session token. The Svix signature is
  // the authentication, so it is verified against the exact raw request body.
  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ) {
    const secret = this.config.get<string>('CLERK_WEBHOOK_SIGNING_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('Webhook secret not configured');
    }
    if (!req.rawBody || !svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException('Missing webhook headers or body');
    }

    const payload = req.rawBody.toString('utf8');
    try {
      // svix 2.x verify() only checks the signature and timestamp, it does not return the payload
      new Webhook(secret).verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch {
      throw new BadRequestException('Invalid signature');
    }
    const event = JSON.parse(payload) as ClerkEvent;

    await this.service.handle(svixId, event);
    return { received: true };
  }
}
