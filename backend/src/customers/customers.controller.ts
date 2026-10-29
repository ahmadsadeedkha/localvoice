import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators';
import { requireTenant } from '../auth/require-tenant';
import { CustomersService } from './customers.service';
import { normalizePhone } from './phone';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.customers.list(
      requireTenant(principal),
      typeof q === 'string' ? q : '',
      Math.min(Math.max(Number(limit) || 20, 1), 100),
      Math.max(Number(offset) || 0, 0),
    );
  }

  @Get(':phone')
  async one(
    @CurrentPrincipal() principal: Principal,
    @Param('phone') rawPhone: string,
  ) {
    const tenantId = requireTenant(principal);
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new NotFoundException();
    const found = await this.customers.findOne(tenantId, phone);
    if (!found) throw new NotFoundException();
    return found;
  }
}
