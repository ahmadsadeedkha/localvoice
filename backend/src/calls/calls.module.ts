import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Call } from '../database/entities/call.entity';
import { CallsService } from './calls.service';
import { CallContextGuard } from './call-context.guard';
import { DevCallsController } from './dev-calls.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Call])],
  controllers: process.env.NODE_ENV === 'production' ? [] : [DevCallsController],
  providers: [CallsService, CallContextGuard],
  exports: [CallsService, CallContextGuard],
})
export class CallsModule {}
