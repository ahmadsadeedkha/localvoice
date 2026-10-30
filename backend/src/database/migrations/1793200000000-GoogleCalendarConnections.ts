import { MigrationInterface, QueryRunner } from 'typeorm';

export class GoogleCalendarConnections1793200000000 implements MigrationInterface {
  name = 'GoogleCalendarConnections1793200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE google_calendar_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
        google_email varchar(320) NOT NULL,
        refresh_token_enc text NOT NULL,
        scopes text NOT NULL,
        calendar_id varchar(255),
        calendar_name varchar(255),
        status varchar(16) NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'revoked')),
        last_error text,
        connected_by_user_id varchar(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE google_calendar_connections`);
  }
}
