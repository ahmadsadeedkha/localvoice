import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators';
import { requireTenant } from '../auth/require-tenant';
import { CallsQueryService } from './calls-query.service';

@Controller('calls')
export class CallsController {
  constructor(private readonly calls: CallsQueryService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const tenantId = requireTenant(principal);
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = Math.max(Number(offset) || 0, 0);
    return this.calls.list(tenantId, take, skip);
  }

  @Get(':id')
  async one(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const tenantId = requireTenant(principal);
    const found = await this.calls.findOne(tenantId, id);
    if (!found) throw new NotFoundException();
    return found;
  }
}
