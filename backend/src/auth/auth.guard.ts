import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getAuth } from '@clerk/express';
import { TenantsService } from '../tenants/tenants.service';
import { TenantStatus } from '../tenants/tenant.entity';
import { mapOrgRole } from './org-role';
import { AuthedRequest } from './auth.types';
import { IS_PUBLIC_KEY } from './decorators';
import { PLATFORM_ADMIN_KEY } from './decorators';


@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenants: TenantsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const auth = getAuth(req);
    if (!auth.userId) throw new UnauthorizedException();

    const platformRoute = this.reflector.getAllAndOverride<boolean>(
      PLATFORM_ADMIN_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    // The tenant always comes from the verified token, never from the request body or URL
    let tenantId: string | null = null;
    if (auth.orgId) {
      const tenant = await this.tenants.findOrProvisionByOrg(
        auth.orgId,
        auth.orgSlug,
      );
      if (tenant.status === TenantStatus.Suspended && !platformRoute) {
        throw new ForbiddenException('Tenant suspended');
      }
      tenantId = tenant.id;
    }

    const metadata = auth.sessionClaims?.metadata as
      { role?: string } | undefined;

    req.principal = {
      userId: auth.userId,
      orgId: auth.orgId ?? null,
      tenantId,
      role: mapOrgRole(auth.orgRole),
      isPlatformAdmin: metadata?.role === 'platform_admin',
    };
    return true;
  }
}
