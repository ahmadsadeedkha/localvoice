import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal, PlatformAdminOnly } from '../auth/decorators';
import { Tenant, TenantStatus } from '../tenants/tenant.entity';
import { TenantsService } from '../tenants/tenants.service';

const statusSchema = z.object({ status: z.enum(TenantStatus) });

const toDto = (t: Tenant) => ({
  id: t.id,
  name: t.name,
  slug: t.slug,
  status: t.status,
  industry: t.industry,
  twilioNumber: t.twilioNumber,
  createdAt: t.createdAt,
});

@Controller('admin')
@PlatformAdminOnly()
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly tenants: TenantsService) {}

  @Get('tenants')
  async list(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const take = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const skip = Math.max(Number(offset) || 0, 0);
    const [items, total] = await this.tenants.findAllPaged(take, skip);
    return { items: items.map(toDto), total };
  }

  @Patch('tenants/:id/status')
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ) {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid status');

    const tenant = await this.tenants.setStatus(id, parsed.data.status);
    if (!tenant) throw new NotFoundException();

    // Replace with a proper audit_logs table later
    this.logger.log(
      `platform admin ${principal.userId} set tenant ${id} to ${tenant.status}`,
    );
    return toDto(tenant);
  }
}
