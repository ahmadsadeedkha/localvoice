import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { MemberRole } from '../tenants/tenant-member.entity';
import { AuthedRequest } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const PLATFORM_ADMIN_KEY = 'platformAdminOnly';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: MemberRole[]) => SetMetadata(ROLES_KEY, roles);
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN_KEY, true);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthedRequest>().principal,
);
