import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookEvent } from './webhook-event.entity';
import { TenantsModule } from '../tenants/tenant.module';
import { ClerkWebhookService } from './clerk-webhook.service';
import { ClerkWebhookController } from './clerk-webhook.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WebhookEvent]), TenantsModule],
  controllers: [ClerkWebhookController],
  providers: [ClerkWebhookService],
  exports: [TypeOrmModule],
})
export class WebhooksModule {}
