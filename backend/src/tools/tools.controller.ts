import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CallContextGuard } from '../calls/call-context.guard';
import { CurrentCall } from '../calls/call-context.decorator';
import { type CallContext } from '../calls/call-context.types';
import { BookInput, BookingService } from '../booking/booking.service';
import { ToolsService } from './tools.service';
import { Public } from '../auth/decorators';

/**
 * Retell custom-function endpoints. Tenant comes ONLY from the guard
 * (verified signature + call id -> calls table), never from the body.
 */
@Public()
@Controller('tools')
@UseGuards(CallContextGuard)
export class ToolsController {
  private readonly log = new Logger(ToolsController.name);

  constructor(
    private readonly tools: ToolsService,
    private readonly booking: BookingService,
  ) {}

  @Post('get-business-info')
  @HttpCode(200)
  getBusinessInfo(@CurrentCall() call: CallContext) {
    this.log.log(`get_business_info call=${call.retellCallId}`);
    return this.tools.getBusinessInfo(call.tenantId);
  }

  @Post('check-availability')
  @HttpCode(200)
  checkAvailability(
    @CurrentCall() call: CallContext,
    @Body() body: { args?: { service_id?: string; date?: string } },
  ) {
    this.log.log(
      `check_availability call=${call.retellCallId} args=${JSON.stringify(body?.args)}`,
    );
    return this.tools.checkAvailability(call.tenantId, body?.args ?? {});
  }

  @Post('book-appointment')
  @HttpCode(200)
  bookAppointment(
    @CurrentCall() call: CallContext,
    @Body() body: { args?: BookInput },
  ) {
    // Deliberately not logging args: they contain the caller's name and phone number.
    this.log.log(
      `book_appointment call=${call.retellCallId} service=${body?.args?.service_id} start=${body?.args?.start}`,
    );
    return this.booking.bookAppointment(call, body?.args ?? {});
  }
}
