import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import Retell from 'retell-sdk';
import { CallsService } from './calls.service';
import { CallContext } from './call-context.types';

/**
 * 1. Verifies the request really came from Retell (signature over the RAW body).
 * 2. Resolves the tenant from the call ID via our own `calls` table.
 * The tenant is NEVER read from the body or from anything the agent can influence.
 */
@Injectable()
export class CallContextGuard implements CanActivate {
  constructor(private readonly calls: CallsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RawBodyRequest<Request>>();

    const signature = req.headers['x-retell-signature'];
    const raw = req.rawBody?.toString('utf8');
    if (typeof signature !== 'string' || !raw) {
      throw new UnauthorizedException('Missing signature or body');
    }

    const apiKey = process.env.RETELL_API_KEY;
    if (!apiKey) throw new Error('RETELL_API_KEY is not set');

    const valid = await Retell.verify(raw, apiKey, signature);
    if (!valid) throw new UnauthorizedException('Invalid signature');

    // Body shape (with "Payload: args only" OFF): { name, call: { call_id, ... }, args }
    let retellCallId: string | undefined;
    try {
      retellCallId = JSON.parse(raw)?.call?.call_id;
    } catch {
      throw new UnauthorizedException('Malformed body');
    }
    if (!retellCallId) throw new UnauthorizedException('No call id');

    const call = await this.calls.findByRetellCallId(retellCallId);
    if (!call || call.status !== 'in_progress') {
      throw new ForbiddenException('Unknown or finished call');
    }

    const context: CallContext = {
      tenantId: call.tenantId,
      callId: call.id,
      retellCallId: call.retellCallId,
    };
    (req as any).callContext = context;
    return true;
  }
}
