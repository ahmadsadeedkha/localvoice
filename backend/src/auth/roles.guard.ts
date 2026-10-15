import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MemberRole } from '../tenants/tenant-member.entity';
import { AuthedRequest } from './auth.types';
import { IS_PUBLIC_KEY, PLATFORM_ADMIN_KEY, ROLES_KEY } from './decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;

    const { principal } = ctx.switchToHttp().getRequest<AuthedRequest>();

    if (
      this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN_KEY, targets) &&
      !principal.isPlatformAdmin
    ) {
      throw new ForbiddenException();
    }

    const roles = this.reflector.getAllAndOverride<MemberRole[]>(
      ROLES_KEY,
      targets,
    );
    if (!roles?.length) return true;

    if (
      !principal.tenantId ||
      !principal.role ||
      !roles.includes(principal.role)
    ) {
      throw new ForbiddenException();
    }
    return true;
  }
}
