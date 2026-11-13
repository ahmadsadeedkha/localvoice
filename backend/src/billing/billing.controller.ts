import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal, Roles } from '../auth/decorators';
import { MemberRole } from '../tenants/tenant-member.entity';
import { InvoicesService } from './invoices.service';
import { parseLedgerQuery, toTenantLedgerDto } from './ledger.dto';
import { WalletService } from './wallet.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly wallets: WalletService,
  ) {}

  // tenant comes from the verified token, never from the URL
  @Get('invoices')
  @Roles(MemberRole.Owner, MemberRole.Admin)
  overview(@CurrentPrincipal() principal: Principal) {
    if (!principal.tenantId) throw new ForbiddenException();
    return this.invoices.overviewForTenant(principal.tenantId);
  }

  // credit history: per-call deductions, top-ups and grants, newest first
  @Get('ledger')
  @Roles(MemberRole.Owner, MemberRole.Admin)
  async ledger(
    @CurrentPrincipal() principal: Principal,
    @Query() query: unknown,
  ) {
    if (!principal.tenantId) throw new ForbiddenException();
    const q = parseLedgerQuery(query);
    const { items, total, timezone } = await this.wallets.listLedger(
      principal.tenantId,
      q,
    );
    return { items: items.map(toTenantLedgerDto), total, timezone };
  }
}
