import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { Payment } from './payment.entity';
import { PAYMENTS_PROVIDER } from './payments-provider.interface';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeProvider } from './stripe.provider';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Payment]), BillingModule],
  controllers: [PaymentsController, StripeWebhookController],
  providers: [
    PaymentsService,
    StripeProvider,
    { provide: PAYMENTS_PROVIDER, useExisting: StripeProvider },
  ],
})
export class PaymentsModule {}
