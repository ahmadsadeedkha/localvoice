import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators';
import { requireTenant } from '../auth/require-tenant';
import { NotificationsService } from './notifications.service';

/** Any member of the business can see its notifications; every query is tenant-scoped. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.list(
      requireTenant(principal),
      Math.min(Math.max(Number(limit) || 15, 1), 50),
    );
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentPrincipal() principal: Principal) {
    return this.notifications.markAllRead(requireTenant(principal));
  }

  @Post(':id/read')
  @HttpCode(200)
  read(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(requireTenant(principal), id);
  }
}
