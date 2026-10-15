import { Request } from 'express';
import { MemberRole } from '../tenants/tenant-member.entity';

export interface Principal {
  userId: string;
  orgId: string | null;
  tenantId: string | null;
  role: MemberRole | null;
  isPlatformAdmin: boolean;
}

export type AuthedRequest = Request & { principal: Principal };
