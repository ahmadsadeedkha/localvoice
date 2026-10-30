import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Response } from 'express';
import { z } from 'zod';
import { type Principal } from '../../auth/auth.types';
import { CurrentPrincipal, Public, Roles } from '../../auth/decorators';
import { requireTenant } from '../../auth/require-tenant';
import { MemberRole } from '../../tenants/tenant-member.entity';
import { GoogleCalendarService } from './google-calendar.service';

const selectCalendarSchema = z.object({
  calendarId: z.string().trim().min(1).max(255),
});

@Controller('integrations/google')
export class GoogleCalendarController {
  private readonly log = new Logger(GoogleCalendarController.name);

  constructor(
    private readonly google: GoogleCalendarService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  status(@CurrentPrincipal() p: Principal) {
    return this.google.status(requireTenant(p));
  }

  /**
   * Returns the Google consent URL as JSON. The browser can't send the Clerk
   * bearer token on a plain redirect, so the frontend fetches this, then sets
   * window.location to the url.
   */
  @Get('connect')
  @Roles(MemberRole.Owner, MemberRole.Admin)
  connect(@CurrentPrincipal() p: Principal) {
    return { url: this.google.buildAuthUrl(requireTenant(p), p.userId) };
  }

  /** Google redirects the browser here. Public: the signed `state` identifies the tenant. */
  @Public()
  @Get('callback')
  async callback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    const back = new URL(
      '/settings',
      this.config.getOrThrow<string>('FRONTEND_URL'),
    );
    try {
      if (error) throw new BadRequestException(error); // e.g. access_denied when user clicks Cancel
      if (!code || !state) throw new BadRequestException('missing_code');
      await this.google.handleCallback(code, state);
      back.searchParams.set('google', 'connected');
    } catch (e) {
      const reason =
        e instanceof BadRequestException ? e.message : 'unexpected_error';
      if (!(e instanceof BadRequestException))
        this.log.error(`Google callback failed: ${String(e)}`);
      back.searchParams.set('google', 'error');
      back.searchParams.set('reason', reason);
    }
    res.redirect(back.toString());
  }

  @Get('calendars')
  @Roles(MemberRole.Owner, MemberRole.Admin)
  calendars(@CurrentPrincipal() p: Principal) {
    return this.google.listCalendars(requireTenant(p));
  }

  @Put('calendar')
  @Roles(MemberRole.Owner, MemberRole.Admin)
  selectCalendar(@CurrentPrincipal() p: Principal, @Body() body: unknown) {
    const parsed = selectCalendarSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('calendarId is required');
    return this.google.selectCalendar(requireTenant(p), parsed.data.calendarId);
  }

  @Delete()
  @Roles(MemberRole.Owner, MemberRole.Admin)
  disconnect(@CurrentPrincipal() p: Principal) {
    return this.google.disconnect(requireTenant(p));
  }
}
