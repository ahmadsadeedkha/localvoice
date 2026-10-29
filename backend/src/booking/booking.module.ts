import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingService } from './booking.service';
import { HoldExpiryService } from './hold-expiry.service';

@Module({
  imports: [AvailabilityModule],
  providers: [BookingService, HoldExpiryService],
  exports: [BookingService, HoldExpiryService],
})
export class BookingModule {}
