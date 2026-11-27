import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class NotificationsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Returns false when this exact job already created its notification (a retry). */
  async create(
    tenantId: string,
    p: {
      type: string;
      title: string;
      body: string;
      link: string | null;
      dedupeKey: string | null;
    },
  ): Promise<boolean> {
    const rows = await this.ds.query(
      `INSERT INTO notifications (tenant_id, type, title, body, link, dedupe_key)
       VALUES ($1::uuid, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [tenantId, p.type, p.title, p.body, p.link, p.dedupeKey],
    );
    return rows.length > 0;
  }

  async list(tenantId: string, limit: number) {
    const [items, counts] = await Promise.all([
      this.ds.query(
        `SELECT id, type, title, body, link,
                read_at AS "readAt", created_at AS "createdAt"
           FROM notifications
          WHERE tenant_id = $1::uuid
          ORDER BY created_at DESC, id DESC
          LIMIT $2`,
        [tenantId, limit],
      ),
      this.ds.query(
        `SELECT count(*)::int AS n FROM notifications
          WHERE tenant_id = $1::uuid AND read_at IS NULL`,
        [tenantId],
      ),
    ]);
    return { items, unreadCount: counts[0]?.n ?? 0 };
  }

  async markRead(tenantId: string, id: string) {
    await this.ds.query(
      `UPDATE notifications SET read_at = now()
        WHERE id = $1::uuid AND tenant_id = $2::uuid AND read_at IS NULL`,
      [id, tenantId],
    );
    return { ok: true };
  }

  async markAllRead(tenantId: string) {
    await this.ds.query(
      `UPDATE notifications SET read_at = now()
        WHERE tenant_id = $1::uuid AND read_at IS NULL`,
      [tenantId],
    );
    return { ok: true };
  }

  /** Owners and admins who have an email on file. */
  async emailRecipients(
    tenantId: string,
  ): Promise<{ email: string; name: string | null }[]> {
    return this.ds.query(
      `SELECT email, name FROM tenant_members
        WHERE tenant_id = $1::uuid
          AND role IN ('owner', 'admin')
          AND email IS NOT NULL`,
      [tenantId],
    );
  }
}
