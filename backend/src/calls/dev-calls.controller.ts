import { Body, Controller, Post } from '@nestjs/common';
import { CallsService } from './calls.service';

/**
 * DEV ONLY. Registered only outside production (see CallsModule).
 * Takes tenantId from the body purely for local testing; this must never exist in prod.
 */
@Controller('dev/calls')
export class DevCallsController {
  constructor(private readonly calls: CallsService) {}

  @Post('web')
  createWebCall(@Body() body: { tenantId: string }) {
    return this.calls.createWebCall(body.tenantId);
  }
}
