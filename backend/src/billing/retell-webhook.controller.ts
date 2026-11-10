import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  type RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Request } from 'express';
import Retell from 'retell-sdk';
import {
  WebhookEvent,
  WebhookProvider,
} from '../webhooks/webhook-event.entity'; // adjust to your path

const BILLING_EVENTS = ['call_ended', 'call_analyzed'];

@Controller('webhooks/retell')
export class RetellWebhookController {
  constructor(
    @InjectRepository(WebhookEvent) private events: Repository<WebhookEvent>,
    @InjectQueue('retell-events') private queue: Queue,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-retell-signature') signature: string,
    @Body() body: any,
  ) {
    // 1) verify the request really came from Retell (needs the raw body)
    const raw = req.rawBody?.toString('utf8') ?? '';
    const valid = await Retell.verify(
      raw,
      process.env.RETELL_API_KEY!,
      signature,
    );
    if (!valid) throw new UnauthorizedException();

    // 2) ignore events billing doesn't care about (e.g. call_started)
    const { event, call } = body ?? {};
    if (!BILLING_EVENTS.includes(event) || !call?.call_id) {
      return { ok: true };
    }

    // 3) store the event; a duplicate delivery hits the unique
    //    (provider, externalEventId) constraint and inserts nothing
    const res = await this.events
      .createQueryBuilder()
      .insert()
      .values({
        provider: WebhookProvider.Retell,
        externalEventId: `${call.call_id}:${event}`,
        eventType: event,
        payload: body,
      })
      .orIgnore()
      .execute();

    // 4) enqueue only if this was a new event
    const isNew = res.raw?.length > 0;
    if (isNew) {
      await this.queue.add(
        event,
        { callId: call.call_id, call },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
        },
      );
    }

    // 5) respond quickly; the processor does the actual charging
    return { ok: true };
  }
}
