import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenant.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [TenantsModule],
  controllers: [AdminController],
})
export class AdminModule {}
