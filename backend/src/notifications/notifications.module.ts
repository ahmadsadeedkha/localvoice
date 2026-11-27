import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from '../billing/invoice.entity';
import { EmailService } from './email.service';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Notification, Invoice]),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor, EmailService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
