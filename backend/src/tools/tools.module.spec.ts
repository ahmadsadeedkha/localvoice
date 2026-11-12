import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ToolsModule } from './tools.module';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { CallsModule } from '../calls/calls.module';
import { CallsService } from '../calls/calls.service';
import { CallContextGuard } from '../calls/call-context.guard';
import { BookingModule } from '../booking/booking.module';
import { BookingService } from '../booking/booking.service';
import { MessagesModule } from '../messages/messages.module';
import { MessagesService } from '../messages/messages.service';
import { AvailabilityModule } from '../availability/availability.module';
import { Service } from '../database/entities/service.entity';
import { BusinessHours } from '../database/entities/business-hours.entity';
import { Tenant } from '../tenants/tenant.entity';
import { TenantMember } from '../tenants/tenant-member.entity';

@Module({
  providers: [{ provide: CallsService, useValue: {} }],
  exports: [CallsService],
})
class TestCallsModule {}

@Module({
  providers: [{ provide: BookingService, useValue: {} }],
  exports: [BookingService],
})
class TestBookingModule {}

@Module({
  providers: [{ provide: MessagesService, useValue: {} }],
  exports: [MessagesService],
})
class TestMessagesModule {}

@Module({})
class TestAvailabilityModule {}

it('resolves the controller guard and its tenant dependency in ToolsModule', async () => {
  // Keep the real ToolsModule and tenant providers, replacing external systems.
  // Nest instantiates @UseGuards guards in the controller's module scope.
  const builder = Test.createTestingModule({ imports: [ToolsModule] })
    .overrideModule(CallsModule)
    .useModule(TestCallsModule)
    .overrideModule(BookingModule)
    .useModule(TestBookingModule)
    .overrideModule(MessagesModule)
    .useModule(TestMessagesModule)
    .overrideModule(AvailabilityModule)
    .useModule(TestAvailabilityModule)
    .overrideProvider(ToolsService)
    .useValue({});
  for (const entity of [Service, BusinessHours, Tenant, TenantMember]) {
    builder.overrideProvider(getRepositoryToken(entity)).useValue({});
  }
  const module = await builder.compile();
  try {
    expect(module.get(ToolsController)).toBeInstanceOf(ToolsController);
    expect(module.get(CallContextGuard)).toBeInstanceOf(CallContextGuard);
  } finally {
    await module.close();
  }
});
