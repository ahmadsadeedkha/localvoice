import { Controller, Get } from '@nestjs/common';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators';
import { requireTenant } from '../auth/require-tenant';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  summary(@CurrentPrincipal() principal: Principal) {
    return this.dashboard.summary(requireTenant(principal));
  }
}
