import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TenantsModule } from '../tenants/tenant.module';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { MeController } from './me.controller';

@Module({
  imports: [TenantsModule],
  controllers: [MeController],
  providers: [
    // Order matters: authenticate first, then check roles
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
