import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus } from './tenant.entity';

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

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(Tenant)
      .values({
        clerkOrgId: orgId,
        name: slug ?? orgId,
        slug: slug ?? orgId.toLowerCase(),
        status: TenantStatus.Trial,
      })
      .orIgnore()
      .execute();

    return this.repo.findOneByOrFail({ clerkOrgId: orgId });
  }
}
