import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvailabilityModule } from '../availability/availability.module';
import { CallsModule } from '../calls/calls.module';
import { BusinessHours } from '../database/entities/business-hours.entity';
import { Service } from '../database/entities/service.entity';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { BookingModule } from '../booking/booking.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Service, BusinessHours]),
    AvailabilityModule,
    BookingModule,
    CallsModule,
  ],
  controllers: [ToolsController],
  providers: [ToolsService],
})
export class ToolsModule {}
