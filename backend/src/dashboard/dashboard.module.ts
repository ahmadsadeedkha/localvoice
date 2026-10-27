import { Module } from '@nestjs/common';
import { CallsModule } from '../calls/calls.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CallsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
