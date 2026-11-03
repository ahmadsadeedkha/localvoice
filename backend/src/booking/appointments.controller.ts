import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal, Roles } from '../auth/decorators';
import { requireTenant } from '../auth/require-tenant';
import { MemberRole } from '../tenants/tenant-member.entity';
import { AppointmentChangesService } from './appointment-changes.service';

const rescheduleSchema = z.object({ start: z.string().min(1).max(64) });

/** Dashboard changes to existing bookings. Owners and admins only. */
@Controller('appointments')
@Roles(MemberRole.Owner, MemberRole.Admin)
export class AppointmentsController {
  constructor(private readonly changes: AppointmentChangesService) {}

  @Get(':id/slots')
  slots(
    @CurrentPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('date') date: string,
  ) {
    return this.changes.slots(requireTenant(p), id, date);
  }

  @Patch(':id/reschedule')
  reschedule(
    @CurrentPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = rescheduleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Pick a time');
    return this.changes.reschedule(requireTenant(p), id, parsed.data.start);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.changes.cancel(requireTenant(p), id);
  }

  @Post(':id/retry-sync')
  @HttpCode(200)
  retrySync(
    @CurrentPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.changes.retrySync(requireTenant(p), id);
  }
}
