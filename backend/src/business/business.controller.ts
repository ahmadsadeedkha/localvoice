import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal, Roles } from '../auth/decorators';
import { requireTenant } from '../auth/require-tenant';
import { MemberRole } from '../tenants/tenant-member.entity';
import {
  createServiceSchema,
  hoursSchema,
  parseBody,
  updateServiceSchema,
} from './business.schemas';
import { BusinessService } from './business.service';

const canEdit = (p: Principal) =>
  p.role === MemberRole.Owner || p.role === MemberRole.Admin;

@Controller()
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get('appointments')
  appointments(
    @CurrentPrincipal() principal: Principal,
    @Query('view') view?: string,
  ) {
    return this.business.appointments(
      requireTenant(principal),
      view === 'past' ? 'past' : 'upcoming',
    );
  }

  @Get('services')
  async services(@CurrentPrincipal() principal: Principal) {
    const data = await this.business.services(requireTenant(principal));
    return { ...data, canEdit: canEdit(principal) };
  }

  @Post('services')
  @Roles(MemberRole.Owner, MemberRole.Admin)
  createService(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    return this.business.createService(
      requireTenant(principal),
      parseBody(createServiceSchema, body),
    );
  }

  @Patch('services/:id')
  @Roles(MemberRole.Owner, MemberRole.Admin)
  updateService(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.business.updateService(
      requireTenant(principal),
      id,
      parseBody(updateServiceSchema, body),
    );
  }

  @Put('hours')
  @Roles(MemberRole.Owner, MemberRole.Admin)
  setHours(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    return this.business.setHours(
      requireTenant(principal),
      parseBody(hoursSchema, body),
    );
  }
}