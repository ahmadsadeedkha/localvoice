import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal, Roles } from '../auth/decorators';
import { MemberRole } from '../tenants/tenant-member.entity';
import { InvoicesService } from './invoices.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly invoices: InvoicesService) {}

  // tenant comes from the verified token, never from the URL
  @Get('invoices')
  @Roles(MemberRole.Owner, MemberRole.Admin)
  overview(@CurrentPrincipal() principal: Principal) {
    if (!principal.tenantId) throw new ForbiddenException();
    return this.invoices.overviewForTenant(principal.tenantId);
  }
}
