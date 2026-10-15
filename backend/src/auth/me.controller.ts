import { Controller, Get } from '@nestjs/common';
import { TenantsService } from '../tenants/tenants.service';
import { type Principal } from './auth.types';
import { CurrentPrincipal } from './decorators';

@Controller('me')
export class MeController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  async me(@CurrentPrincipal() principal: Principal) {
    const tenant = principal.tenantId
      ? await this.tenants.findById(principal.tenantId)
      : null;

    return {
      userId: principal.userId,
      role: principal.role,
      isPlatformAdmin: principal.isPlatformAdmin,
      tenant: tenant && {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
      },
    };
  }
}
