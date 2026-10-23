import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../database/entities/booking.entity';
import { BusinessHours } from '../database/entities/business-hours.entity';
import { Resource } from '../database/entities/resource.entity';
import { AVAILABILITY_PROVIDER } from './availability.provider';
import { MockAvailabilityProvider } from './mock-availability.provider';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessHours, Resource, Booking])],
  providers: [{ provide: AVAILABILITY_PROVIDER, useClass: MockAvailabilityProvider }],
  exports: [AVAILABILITY_PROVIDER],
})
export class AvailabilityModule {}
