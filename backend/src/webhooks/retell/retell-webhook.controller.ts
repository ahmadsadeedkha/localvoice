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
      this.logger.warn('Retell payload is not valid JSON');
      throw new BadRequestException();
    }

    const callId = payload.call?.call_id;
    this.logger.log(`Retell verified: ${payload.event} call=${callId}`);

    // Persist/enqueue only, then return fast. Heavy work goes to BullMQ.
    try {
      await this.service.ingest(payload.event, payload.call);
      this.logger.log(`Retell ingested: ${payload.event} call=${callId}`);
    } catch (err) {
      this.logger.error(
        `Retell ingest failed: ${payload.event} call=${callId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }
}
