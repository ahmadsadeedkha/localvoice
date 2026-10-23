import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Retell from 'retell-sdk';
import { Call } from '../database/entities/call.entity';

@Injectable()
export class CallsService {
  private readonly retell = new Retell({ apiKey: process.env.RETELL_API_KEY! });

  constructor(
    @InjectRepository(Call) private readonly repo: Repository<Call>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  findByRetellCallId(retellCallId: string) {
    return this.repo.findOne({ where: { retellCallId } });
  }

  /**
   * Dev/test path (no telephony): create a Retell web call for a tenant.
   * The calls row is written BEFORE the access token goes back to the browser,
   * so every tool call that follows can be resolved to this tenant.
   */
  async createWebCall(tenantId: string) {
    const dynamicVariables = await this.buildDynamicVariables(tenantId);

    const res = await this.retell.call.createWebCall({
      agent_id: process.env.RETELL_AGENT_ID!,
      // debugging aid only; never trusted for tenant resolution
      metadata: { tenant_id: tenantId },
      retell_llm_dynamic_variables: dynamicVariables,
    });

    await this.repo.save(
      this.repo.create({
        tenantId,
        retellCallId: res.call_id,
        source: 'web_test',
      }),
    );

    return { accessToken: res.access_token, callId: res.call_id };
  }

  /** Retell requires every dynamic variable value to be a string. */
  private async buildDynamicVariables(tenantId: string): Promise<Record<string, string>> {
    const rows = await this.ds.query(
      `SELECT name, timezone FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (!rows.length) throw new Error('Tenant not found');
    return {
      business_name: String(rows[0].name),
      timezone: String(rows[0].timezone),
      // hours + services get added in the agent step
    };
  }
}
