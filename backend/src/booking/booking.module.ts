import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingService } from './booking.service';

@Module({
  imports: [AvailabilityModule],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
