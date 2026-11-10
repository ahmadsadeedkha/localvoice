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
import { Tenant } from '../tenants/tenant.entity';

// If our own lookup fails (DB down, bug): true = let the call through,
// false = reject it. Letting calls through is the safer default for paying
// customers; flip it if you'd rather never give free calls.
const FAIL_OPEN = true;

@Controller('webhooks/retell-inbound')
export class RetellInboundController {
  private readonly log = new Logger(RetellInboundController.name);

  constructor(
    private wallets: WalletService,
    @InjectRepository(Tenant) private tenants: Repository<Tenant>,
  ) {}

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

    try {
      const tenant = await this.tenants.findOne({
        where: { retellAgentId: agentId },
        select: { id: true },
      });
      if (!tenant) {
        this.log.warn(`Inbound call for unknown agent ${agentId}`);
        return { call_inbound: { override_agent_id: agentId } };
      }

      const gate = await this.wallets.getCallGate(tenant.id);

      if (!gate.allowed) {
        this.log.log(
          `Blocked inbound call, tenant ${tenant.id}: ${gate.reason}`,
        );
        const fallback = process.env.BLOCKED_FALLBACK_AGENT_ID;
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
          override_agent_id: agentId,
          metadata: { tenant_id: tenant.id }, // resolveTenantId reads this at call_ended
          agent_override: {
            agent: { max_call_duration_ms: gate.maxDurationMs },
          },
        },
      };
    } catch (e) {
      this.log.error(
        `Inbound gate failed: ${e instanceof Error ? e.message : e}`,
      );
      return FAIL_OPEN
        ? { call_inbound: { override_agent_id: agentId } }
        : { call_inbound: { reject: true } };
    }
  }
}
