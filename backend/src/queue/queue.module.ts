import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BookingModule } from '../booking/booking.module';
import { MAINTENANCE_QUEUE } from './maintenance.constants';
import { MaintenanceProcessor } from './maintenance.processor';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { redisConnection } from './redis-connection';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config.getOrThrow<string>('REDIS_URL')),
      }),
    }),
    BullModule.registerQueue({ name: MAINTENANCE_QUEUE }),
    BookingModule,
  ],
  providers: [MaintenanceProcessor, MaintenanceScheduler],
})
export class QueueModule {}
