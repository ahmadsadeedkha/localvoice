import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RetellWebhookController } from './retell-webhook.controller';
import { RetellEventsProcessor } from './retell-events.processor';
import { WalletService } from './wallet.service';
import { TenantWallet } from './tenant-wallet.entity';
import { CreditLedger } from './credit-ledger.entity';
import { WebhookEvent } from '../webhooks/webhook-event.entity';
import { Tenant } from '../tenants/tenant.entity';
import { RetellInboundController } from './retell-inbound.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantWallet,
      CreditLedger,
      WebhookEvent,
      Tenant,
    ]),
    BullModule.registerQueue(
      { name: 'retell-events' },
      { name: 'notifications' },
    ),
  ],
  controllers: [RetellWebhookController, RetellInboundController],
  providers: [RetellEventsProcessor, WalletService],
  exports: [WalletService],
})
export class BillingModule {}
