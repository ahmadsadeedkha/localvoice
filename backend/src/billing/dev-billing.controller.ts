import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { WalletService } from './wallet.service';

@Public()
@Controller('dev/billing')
export class DevBillingController {
  constructor(private readonly wallets: WalletService) {}

  @Post('top-up')
  topUp(@Body() body: { tenantId: string; credits: number; note?: string }) {
    return this.wallets.topUp({
      tenantId: body.tenantId,
      credits: Number(body.credits),
      type: 'adjustment',
      note: body.note ?? 'Dev top-up',
    });
  }

  // shows the wallet and what the pre-call gate decides, handy for debugging
  @Get('wallet/:tenantId')
  async wallet(@Param('tenantId') tenantId: string) {
    return {
      wallet: await this.wallets.getWallet(tenantId),
      gate: await this.wallets.getCallGate(tenantId),
    };
  }
}
