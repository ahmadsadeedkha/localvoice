import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators';
import { requireTenant } from '../auth/require-tenant';
import { parseBody } from '../business/business.schemas';
import { MessagesService } from './messages.service';

const updateStatusSchema = z.object({
  status: z.enum(['new', 'read', 'handled']),
});

/** Any member of the business can work the inbox; every query is tenant-scoped. */
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('view') view?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.messages.list(
      requireTenant(principal),
      view === 'handled' ? 'handled' : 'open',
      Math.min(Math.max(Number(limit) || 20, 1), 100),
      Math.max(Number(offset) || 0, 0),
    );
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { status } = parseBody(updateStatusSchema, body);
    return this.messages.updateStatus(requireTenant(principal), id, status);
  }
}
