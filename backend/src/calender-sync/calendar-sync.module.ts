import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GoogleCalendarModule } from '../integrations/google/google-calendar.module';
import { CALENDAR_SYNC_QUEUE } from './calendar-sync.constants';
import { CalendarSyncProcessor } from './calendar-sync.processor';
import { CalendarSyncScheduler } from './calendar-sync.scheduler';
import { CalendarSyncService } from './calendar-sync.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: CALENDAR_SYNC_QUEUE }),
    GoogleCalendarModule,
  ],
  providers: [
    CalendarSyncService,
    CalendarSyncProcessor,
    CalendarSyncScheduler,
  ],
})
export class CalendarSyncModule {}
