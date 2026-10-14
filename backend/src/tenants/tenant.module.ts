import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';
import { TenantMember } from './tenant-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantMember])],
  exports: [TypeOrmModule],
})
export class TenantsModule {}
