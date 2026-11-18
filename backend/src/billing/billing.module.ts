import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RetellInboundController } from './retell-inbound.controller';
import { AdminBillingController } from './admin-billing.controller';
import { AdminInvoicesController } from './admin-invoices.controller';
import { BillingController } from './billing.controller';
import { RetellEventsProcessor } from './retell-events.processor';
import { BillingJobsProcessor } from './billing-jobs.processor';
import { BillingSchedulerService } from './billing-scheduler.service';
import { BillingSettingsService } from './billing-settings.service';
import { InvoicesService } from './invoices.service';
import { WalletService } from './wallet.service';
import { TenantWallet } from './tenant-wallet.entity';
import { CreditLedger } from './credit-ledger.entity';
import { Invoice } from './invoice.entity';
import { WebhookEvent } from '../webhooks/webhook-event.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ConfigModule } from '@nestjs/config';
import { PricingMarginChange } from './pricing-margin-change.entity';
import { AdminPricingController } from './admin-pricing.controller';
import { PricingService } from './pricing.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      TenantWallet,
      CreditLedger,
      Invoice,
      WebhookEvent,
      Tenant,
      PricingMarginChange,
    ]),
    BullModule.registerQueue(
      { name: 'retell-events' },
      { name: 'notifications' },
      { name: 'billing-jobs' },
    ),
  ],
  controllers: [
    RetellInboundController,
    AdminBillingController,
    AdminInvoicesController,
    BillingController,
    AdminPricingController,
  ],
  providers: [
    RetellEventsProcessor,
    BillingJobsProcessor,
    BillingSchedulerService,
    BillingSettingsService,
    InvoicesService,
    WalletService,
    PricingService,
  ],
  exports: [WalletService, InvoicesService, PricingService],
})
export class BillingModule {}
