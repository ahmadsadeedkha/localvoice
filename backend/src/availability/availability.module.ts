import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../database/entities/booking.entity';
import { BusinessHours } from '../database/entities/business-hours.entity';
import { Resource } from '../database/entities/resource.entity';
import { AVAILABILITY_PROVIDER } from './availability.provider';
import { MockAvailabilityProvider } from './mock-availability.provider';
import { GoogleCalendarModule } from '../integrations/google/google-calendar.module';
import { GoogleAvailabilityProvider } from './google-availability.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([BusinessHours, Resource, Booking]),
    GoogleCalendarModule,
  ],
  providers: [
    MockAvailabilityProvider,
    { provide: AVAILABILITY_PROVIDER, useClass: GoogleAvailabilityProvider },
  ],
  exports: [AVAILABILITY_PROVIDER],
})
export class AvailabilityModule {}
