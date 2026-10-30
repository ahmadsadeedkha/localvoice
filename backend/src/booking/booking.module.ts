import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingService } from './booking.service';
import { HoldExpiryService } from './hold-expiry.service';
import { CALENDAR_SYNC_QUEUE } from '../calender-sync/calendar-sync.constants';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    AvailabilityModule,
    BullModule.registerQueue({ name: CALENDAR_SYNC_QUEUE }),
  ],
  providers: [BookingService, HoldExpiryService],
  exports: [BookingService, HoldExpiryService],
})
export class BookingModule {}
