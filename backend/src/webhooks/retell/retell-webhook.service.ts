import { Injectable, Logger } from '@nestjs/common';
@Injectable()
export class RetellWebhookService {
  private readonly logger = new Logger(RetellWebhookService.name);

  async ingest(event: string, call: any) {
    const eventId = `${event}:${call.call_id}`; // unique per call per event

    // 1. Idempotency: insert into webhook_events (source='retell', external_id=eventId)
    //    with ON CONFLICT DO NOTHING; if nothing inserted, it's a retry, so return.

    switch (event) {
      case 'call_started':
        // resolve tenant (see note below), create calls row: status 'in_progress'
        break;
      case 'call_ended':
        // update calls row: ended_at, duration, disconnection_reason, transcript
        break;
      case 'call_analyzed':
        // store call.call_analysis (summary, sentiment, custom fields)
        // enqueue BullMQ job for the post-call summary/SMS follow-up
        break;
      default:
        this.logger.debug(`Ignoring ${event}`);
    }
  }
}
