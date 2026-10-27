import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEvent } from './webhook-event.entity';
import { TenantsModule } from '../tenants/tenant.module';
import { ClerkWebhookService } from './clerk-webhook.service';
import { ClerkWebhookController } from './clerk-webhook.controller';
import { RetellWebhookController } from './retell/retell-webhook.controller';
import { RetellWebhookService } from './retell/retell-webhook.service';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEvent]), TenantsModule],
  controllers: [ClerkWebhookController, RetellWebhookController],
  providers: [ClerkWebhookService, RetellWebhookService],
  exports: [TypeOrmModule],
})
export class WebhooksModule {}
