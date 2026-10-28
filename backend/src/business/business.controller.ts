import { Controller, Get, Query } from '@nestjs/common';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators';
import { requireTenant } from '../auth/require-tenant';
import { BusinessService } from './business.service';

@Controller()
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get('appointments')
  appointments(
    @CurrentPrincipal() principal: Principal,
    @Query('view') view?: string,
  ) {
    return this.business.appointments(
      requireTenant(principal),
      view === 'past' ? 'past' : 'upcoming',
    );
  }

  @Get('services')
  services(@CurrentPrincipal() principal: Principal) {
    return this.business.services(requireTenant(principal));
  }
}
