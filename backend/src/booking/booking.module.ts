import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingService } from './booking.service';
import { HoldExpiryService } from './hold-expiry.service';
import { CALENDAR_SYNC_QUEUE } from '../calendar-sync/calendar-sync.constants';
import { BullModule } from '@nestjs/bullmq';
import { AppointmentsController } from './appointments.controller';
import { AppointmentChangesService } from './appointment-changes.service';

@Module({
  imports: [
    AvailabilityModule,
    BullModule.registerQueue({ name: CALENDAR_SYNC_QUEUE }),
  ],
  controllers: [AppointmentsController],
  providers: [BookingService, HoldExpiryService, AppointmentChangesService],
  exports: [BookingService, HoldExpiryService],
})
export class BookingModule {}
