import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Call } from '../database/entities/call.entity';
import { CallsService } from './calls.service';
import { CallContextGuard } from './call-context.guard';
import { DevCallsController } from './dev-calls.controller';
import { CallsQueryService } from './calls-query.service';
import { CallsController } from './calls.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Call])],
  controllers: [
    CallsController,
    ...(process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_DEV_CALLS === 'true'
      ? [DevCallsController]
      : []),
  ],
  providers: [CallsService, CallsQueryService, CallContextGuard],
  exports: [CallsService, CallsQueryService, CallContextGuard],
})
export class CallsModule {}
