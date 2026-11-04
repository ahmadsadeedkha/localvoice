import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from './tenant.entity';

/** New tenants start in this timezone until they change it in settings. */
const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE ?? 'Asia/Karachi';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly repo: Repository<Tenant>,
  ) {}

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  // First request from a new organization creates its tenant row. Idempotent and
  // race-safe through the unique clerk_org_id index. Webhooks will later keep
  // names, members and deletions in sync.
  async findOrProvisionByOrg(
    orgId: string,
    slug?: string | null,
  ): Promise<Tenant> {
    const existing = await this.repo.findOne({ where: { clerkOrgId: orgId } });
    if (existing) return existing;

    await this.repo.manager.transaction(async (m) => {
      await m
        .createQueryBuilder()
        .insert()
        .into(Tenant)
        .values({
          clerkOrgId: orgId,
          name: slug ?? orgId,
          slug: slug ?? orgId.toLowerCase(),
          status: TenantStatus.Trial,
          timezone: DEFAULT_TIMEZONE,
        })
        .orIgnore()
        .execute();

      // Availability needs at least one active resource to place bookings on.
      // Without it every day comes back "fully booked".
      await m.query(
        `INSERT INTO resources (tenant_id, name)
         SELECT t.id, 'Default' FROM tenants t
         WHERE t.clerk_org_id = $1
           AND NOT EXISTS (SELECT 1 FROM resources r WHERE r.tenant_id = t.id)`,
        [orgId],
      );
    });

    return this.repo.findOneByOrFail({ clerkOrgId: orgId });
  }

  findAllPaged(take: number, skip: number): Promise<[Tenant[], number]> {
    return this.repo.findAndCount({ order: { createdAt: 'DESC' }, take, skip });
  }

  async setStatus(id: string, status: TenantStatus): Promise<Tenant | null> {
    const tenant = await this.repo.findOne({ where: { id } });
    if (!tenant) return null;
    tenant.status = status;
    return this.repo.save(tenant);
  }
}
