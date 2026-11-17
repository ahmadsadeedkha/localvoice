import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators';
import { PaymentsService } from './payments.service';

@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post('stripe')
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing body or signature');
    }
    await this.payments.handleWebhook(req.rawBody, signature);
    return { received: true };
  }
}
