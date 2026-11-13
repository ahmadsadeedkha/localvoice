import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal, PlatformAdminOnly } from '../auth/decorators';
import { parseLedgerQuery, toAdminLedgerDto } from './ledger.dto';
import { WalletService } from './wallet.service';

const topUpSchema = z.object({
  // positive, two decimals at most; the upper limit catches typos
  credits: z.number().positive().max(100000).multipleOf(0.01),
  type: z.enum(['grant', 'adjustment']),
  // every manual change must say why
  note: z.string().trim().min(3).max(200),
});

@Controller('admin/tenants')
@PlatformAdminOnly()
export class AdminBillingController {
  private readonly logger = new Logger(AdminBillingController.name);

  constructor(private readonly wallets: WalletService) {}

  @Post(':id/credits')
  @HttpCode(200)
  async addCredits(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ) {
    const parsed = topUpSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'Invalid body: credits (positive number), type (grant | adjustment), note (3+ characters)',
      );
    }
    const { credits, type, note } = parsed.data;

    const result = await this.wallets.topUp({
      tenantId: id,
      credits,
      type,
      note: `${note} (admin: ${principal.userId})`,
    });

    this.logger.log(
      `platform admin ${principal.userId} added ${credits} credits (${type}) to tenant ${id}`,
    );
    return result;
  }

  @Get(':id/ledger')
  async ledger(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: unknown,
  ) {
    const { items, total } = await this.wallets.listLedger(
      id,
      parseLedgerQuery(query),
    );
    return { items: items.map(toAdminLedgerDto), total };
  }
}
