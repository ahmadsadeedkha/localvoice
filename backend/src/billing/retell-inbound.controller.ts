import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  type RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import Retell from 'retell-sdk';
import { WalletService } from './wallet.service';
import { Tenant, TenantStatus } from '../tenants/tenant.entity';
import { Public } from '../auth/decorators';
import { ConfigService } from '@nestjs/config';

@Controller('webhooks/retell-inbound')
export class RetellInboundController {
  private readonly log = new Logger(RetellInboundController.name);

  constructor(
    private wallets: WalletService,
    @InjectRepository(Tenant) private tenants: Repository<Tenant>,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-retell-signature') signature: string,
    @Body() body: any,
  ) {
    const raw = req.rawBody?.toString('utf8') ?? '';
    const valid = await Retell.verify(
      raw,
      process.env.RETELL_API_KEY!,
      signature,
    );
    if (!valid) throw new UnauthorizedException();

    const agentId: string | undefined = body?.call_inbound?.agent_id;
    const number = body?.call_inbound?.to_number;
    if (typeof number !== 'string' || !/^\+[1-9]\d{6,14}$/.test(number)) {
      return { call_inbound: { reject: true } };
    }

    try {
      const matches = await this.tenants
        .createQueryBuilder('t')
        .select(['t.id', 't.status', 't.retellAgentId'])
        .where(
          `t.twilioNumber = :number OR EXISTS (
          SELECT 1 FROM phone_numbers p WHERE p.tenant_id = t.id AND p.e164 = :number
        )`,
          { number },
        )
        .take(2)
        .getMany();
      if (
        matches.length !== 1 ||
        matches[0].status === TenantStatus.Suspended
      ) {
        return { call_inbound: { reject: true } };
      }
      const tenant = matches[0];
      const selectedAgentId = tenant.retellAgentId ?? agentId;
      if (!selectedAgentId) return { call_inbound: { reject: true } };

      const gate = await this.wallets.getCallGate(tenant.id);

      if (!gate.allowed) {
        this.log.log(
          `Blocked inbound call, tenant ${tenant.id}: ${gate.reason}`,
        );
        const fallback = this.config.get<string>('BLOCKED_FALLBACK_AGENT_ID');
        if (fallback) {
          // no tenant_id in metadata, so this call is never charged to the tenant
          return {
            call_inbound: {
              override_agent_id: fallback,
              metadata: { blocked_reason: gate.reason },
            },
          };
        }
        return { call_inbound: { reject: true } };
      }

      return {
        call_inbound: {
          override_agent_id: selectedAgentId,
          metadata: { tenant_id: tenant.id }, // resolveTenantId reads this at call_ended
          agent_override: {
            agent: { max_call_duration_ms: gate.maxDurationMs },
          },
        },
      };
    } catch (e) {
      this.log.error(
        `Inbound gate failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { call_inbound: { reject: true } };
    }
  }
}
