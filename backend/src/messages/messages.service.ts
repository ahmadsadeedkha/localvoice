import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { type CallContext } from '../calls/call-context.types';
import {
  MAX_MESSAGES_PER_CALL,
  type TakeMessageInput,
  type TransferInput,
  validateTakeMessage,
  validateTransfer,
} from './messages.validation';

export type MessageStatus = 'new' | 'read' | 'handled';
export type MessageView = 'open' | 'handled';

const COLUMNS = `id, call_id, kind, caller_name, caller_phone, body, status, created_at`;

const toDto = (r: any) => ({
  id: r.id as string,
  callId: r.call_id as string | null,
  kind: r.kind as 'message' | 'transfer_request',
  callerName: r.caller_name as string | null,
  callerPhone: r.caller_phone as string | null,
  body: r.body as string,
  status: r.status as MessageStatus,
  createdAt: r.created_at as Date,
});

@Injectable()
export class MessagesService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private async callerId(call: CallContext): Promise<string | null> {
    const rows = await this.ds.query(
      `SELECT from_number FROM calls WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [call.callId, call.tenantId],
    );
    return rows[0]?.from_number ?? null;
  }

  // ---- Agent tools -------------------------------------------------------

  /** Voice-flow entry point for `take_message`. Errors are data, not exceptions. */
  async takeMessage(call: CallContext, input: TakeMessageInput) {
    const v = validateTakeMessage(input, await this.callerId(call));
    if (!v.ok) return v.error;
    const { callerName, callerPhone, body } = v.value;

    // Retell may retry a tool call: the same words on the same call are one message.
    const dup = await this.ds.query(
      `SELECT id FROM messages
       WHERE tenant_id = $1::uuid AND call_id = $2::uuid
         AND kind = 'message' AND body = $3
       LIMIT 1`,
      [call.tenantId, call.callId, body],
    );
    if (dup.length) return this.savedResponse(dup[0].id);

    const count = await this.ds.query(
      `SELECT count(*)::int AS n FROM messages
       WHERE tenant_id = $1::uuid AND call_id = $2::uuid AND kind = 'message'`,
      [call.tenantId, call.callId],
    );
    if (count[0].n >= MAX_MESSAGES_PER_CALL) {
      return {
        error: 'too_many_messages',
        message:
          'The message limit for one call was reached. Tell the caller you cannot take any more messages on this call.',
      };
    }

    const rows = await this.ds.query(
      `INSERT INTO messages (tenant_id, call_id, kind, caller_name, caller_phone, body)
       VALUES ($1::uuid, $2::uuid, 'message', $3, $4, $5)
       RETURNING id`,
      [call.tenantId, call.callId, callerName, callerPhone, body],
    );
    return this.savedResponse(rows[0].id);
  }

  private savedResponse(id: string) {
    return {
      saved: true,
      message_id: id,
      message:
        'The message was passed on to the team. Confirm that to the caller and say someone will get back to them.',
    };
  }

  /**
   * Voice-flow entry point for `transfer_to_human`. There is no live transfer
   * until telephony exists, so this records a transfer request for staff and
   * tells the agent to promise a callback instead of a live handover.
   */
  async transferToHuman(call: CallContext, input: TransferInput) {
    const response = {
      requested: true,
      live_transfer: false,
      message:
        'A live transfer is not possible right now. Tell the caller their request was logged and someone from the team will call them back, and offer to take a message as well.',
    };

    // One request per call; a retried tool call returns the same answer.
    const existing = await this.ds.query(
      `SELECT id FROM messages
       WHERE tenant_id = $1::uuid AND call_id = $2::uuid AND kind = 'transfer_request'
       LIMIT 1`,
      [call.tenantId, call.callId],
    );
    if (existing.length) return response;

    const { callerName, callerPhone, reason } = validateTransfer(
      input,
      await this.callerId(call),
    );
    await this.ds.query(
      `INSERT INTO messages (tenant_id, call_id, kind, caller_name, caller_phone, body)
       VALUES ($1::uuid, $2::uuid, 'transfer_request', $3, $4, $5)`,
      [call.tenantId, call.callId, callerName, callerPhone, reason],
    );
    return response;
  }

  // ---- Inbox (dashboard) -------------------------------------------------

  async list(
    tenantId: string,
    view: MessageView,
    limit: number,
    offset: number,
  ) {
    const filter =
      view === 'handled' ? `status = 'handled'` : `status <> 'handled'`;
    const [rows, counts, tz] = await Promise.all([
      this.ds.query(
        `SELECT ${COLUMNS} FROM messages
         WHERE tenant_id = $1::uuid AND ${filter}
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      ),
      this.ds.query(
        `SELECT count(*) FILTER (WHERE status <> 'handled')::int AS open,
                count(*) FILTER (WHERE status = 'new')::int AS new,
                count(*) FILTER (WHERE status = 'handled')::int AS handled
         FROM messages WHERE tenant_id = $1::uuid`,
        [tenantId],
      ),
      this.ds.query(`SELECT timezone FROM tenants WHERE id = $1::uuid`, [
        tenantId,
      ]),
    ]);

    return {
      timezone: (tz[0]?.timezone as string | undefined) ?? 'UTC',
      view,
      counts: {
        open: counts[0].open as number,
        new: counts[0].new as number,
        handled: counts[0].handled as number,
      },
      total:
        view === 'handled'
          ? (counts[0].handled as number)
          : (counts[0].open as number),
      items: rows.map(toDto),
    };
  }

  /** Tenant-scoped: another business's message id is simply "not found". */
  async updateStatus(tenantId: string, id: string, status: MessageStatus) {
    const rows = await this.ds.query(
      `UPDATE messages SET status = $3
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       RETURNING ${COLUMNS}`,
      [id, tenantId, status],
    );
    if (!rows.length) throw new NotFoundException();
    return toDto(rows[0]);
  }
}
