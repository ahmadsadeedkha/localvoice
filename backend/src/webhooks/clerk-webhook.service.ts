import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { mapOrgRole } from '../auth/org-role';
import { MemberRole, TenantMember } from '../tenants/tenant-member.entity';
import { Tenant, TenantStatus } from '../tenants/tenant.entity';
import { TenantsService } from '../tenants/tenants.service';
import {
  WebhookEvent,
  WebhookEventStatus,
  WebhookProvider,
} from './webhook-event.entity';

export interface ClerkEvent {
  type: string;
  data: Record<string, unknown>;
}

interface OrgData {
  id: string;
  name?: string | null;
  slug?: string | null;
}

interface MembershipData {
  role?: string | null;
  organization: OrgData;
  public_user_data?: {
    user_id: string;
    first_name?: string | null;
    last_name?: string | null;
    identifier?: string | null;
  };
}

interface UserData {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: { id: string; email_address: string }[];
}

const fullName = (first?: string | null, last?: string | null) =>
  [first, last].filter(Boolean).join(' ') || null;

@Injectable()
export class ClerkWebhookService {
  private readonly logger = new Logger(ClerkWebhookService.name);

  constructor(
    @InjectRepository(WebhookEvent)
    private readonly events: Repository<WebhookEvent>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantMember)
    private readonly members: Repository<TenantMember>,
    private readonly tenants: TenantsService,
  ) {}

  // svix-id is the same on every retry of one event, so it is our idempotency key.
  // A processed event is skipped; a failed one is retried when Clerk redelivers it.
  async handle(externalEventId: string, event: ClerkEvent): Promise<void> {
    await this.events
      .createQueryBuilder()
      .insert()
      .into(WebhookEvent)
      .values({
        provider: WebhookProvider.Clerk,
        externalEventId,
        eventType: event.type,
        // TypeORM's deep-partial type cannot express an arbitrary jsonb payload
        payload: event as never,
      })
      .orIgnore()
      .execute();

    const row = await this.events.findOneByOrFail({
      provider: WebhookProvider.Clerk,
      externalEventId,
    });
    if (row.status === WebhookEventStatus.Processed) return;

    try {
      row.tenantId = await this.apply(event);
      row.status = WebhookEventStatus.Processed;
      row.error = null;
      row.processedAt = new Date();
    } catch (err) {
      row.status = WebhookEventStatus.Failed;
      row.error = err instanceof Error ? err.message : String(err);
      await this.events.save(row);
      throw err; // non-2xx makes Clerk retry with backoff
    }
    await this.events.save(row);
  }

  // Returns the affected tenant id when there is one (informational).
  private async apply(event: ClerkEvent): Promise<string | null> {
    switch (event.type) {
      case 'organization.created':
      case 'organization.updated':
        return this.upsertOrganization(event.data as unknown as OrgData);

      case 'organization.deleted':
        return this.suspendOrganization(event.data as unknown as OrgData);

      case 'organizationMembership.created':
      case 'organizationMembership.updated':
        return this.upsertMembership(event.data as unknown as MembershipData);

      case 'organizationMembership.deleted':
        return this.removeMembership(event.data as unknown as MembershipData);

      case 'user.updated':
        await this.syncUser(event.data as unknown as UserData);
        return null;

      case 'user.deleted':
        await this.members.delete({
          clerkUserId: (event.data as unknown as UserData).id,
        });
        return null;

      default:
        // user.created and anything else: a user has no tenant until they join
        // an organization, so there is nothing to store yet.
        this.logger.debug(`ignored ${event.type}`);
        return null;
    }
  }

  private async upsertOrganization(org: OrgData): Promise<string> {
    const tenant = await this.tenants.findOrProvisionByOrg(org.id, org.slug);
    if (org.name) tenant.name = org.name;
    if (org.slug) tenant.slug = org.slug;
    await this.tenantRepo.save(tenant);
    return tenant.id;
  }

  // Deleting a Clerk org must not erase call history, so the tenant is suspended.
  private async suspendOrganization(org: OrgData): Promise<string | null> {
    const tenant = await this.tenantRepo.findOne({
      where: { clerkOrgId: org.id },
    });
    if (!tenant) return null;
    tenant.status = TenantStatus.Suspended;
    await this.tenantRepo.save(tenant);
    return tenant.id;
  }

  private async upsertMembership(m: MembershipData): Promise<string | null> {
    const user = m.public_user_data;
    if (!user) return null;

    // Events can arrive out of order, so the tenant is created here if needed
    const tenant = await this.tenants.findOrProvisionByOrg(
      m.organization.id,
      m.organization.slug,
    );

    await this.members.upsert(
      {
        tenantId: tenant.id,
        clerkUserId: user.user_id,
        email: user.identifier ?? null,
        name: fullName(user.first_name, user.last_name),
        role: mapOrgRole(m.role) ?? MemberRole.Staff,
      },
      ['tenantId', 'clerkUserId'],
    );
    return tenant.id;
  }

  private async removeMembership(m: MembershipData): Promise<string | null> {
    const userId = m.public_user_data?.user_id;
    const tenant = await this.tenantRepo.findOne({
      where: { clerkOrgId: m.organization.id },
    });
    if (!userId || !tenant) return null;
    await this.members.delete({ tenantId: tenant.id, clerkUserId: userId });
    return tenant.id;
  }

  // Keeps name and email fresh on every membership row of this user
  private async syncUser(user: UserData): Promise<void> {
    const email =
      user.email_addresses?.find((e) => e.id === user.primary_email_address_id)
        ?.email_address ?? null;
    await this.members.update(
      { clerkUserId: user.id },
      { email, name: fullName(user.first_name, user.last_name) },
    );
  }
}
