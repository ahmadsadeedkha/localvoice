import { ForbiddenException } from '@nestjs/common';
import { type Principal } from './auth.types';

/**
 * Tenant-facing endpoints must always be scoped to the tenant from the verified
 * token. A signed-in user with no active organization has no tenant, so refuse.
 */
export function requireTenant(principal: Principal): string {
  if (!principal.tenantId) throw new ForbiddenException('No active business');
  return principal.tenantId;
}
