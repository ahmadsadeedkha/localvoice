import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { verifyRetellSignature } from './retell-signature';
import { RetellWebhookService } from './retell-webhook.service';
import { Public } from '../../auth/decorators';

@Controller('webhooks/retell')
export class RetellWebhookController {
  private readonly logger = new Logger(RetellWebhookController.name);
  constructor(private readonly service: RetellWebhookService) {}

  @Public()
  @Post()
  @HttpCode(204)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-retell-signature') signature?: string,
  ) {
    this.logger.log(
      `Retell hit: sig=${signature ? 'yes' : 'no'}, rawBody=${req.rawBody ? req.rawBody.length : 'MISSING'}`,
    );
    const raw = req.rawBody?.toString('utf8') ?? '';
    if (!verifyRetellSignature(raw, process.env.RETELL_API_KEY!, signature)) {
      this.logger.warn('Invalid Retell signature');
      throw new UnauthorizedException();
    }

    let payload: { event: string; call: any };
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new BadRequestException();
    }

    // Persist/enqueue only, then return fast. Heavy work goes to BullMQ.
    await this.service.ingest(payload.event, payload.call);
  }
}
