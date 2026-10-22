import { MigrationInterface, QueryRunner } from 'typeorm';

export class Week2Schema1792627200000 implements MigrationInterface {
  name = 'Week2Schema1792627200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await q.query(
      `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone varchar(64) NOT NULL DEFAULT 'UTC'`,
    );

    // Bookable thing (technician, chair, room). Every tenant gets one default.
    await q.query(`
      CREATE TABLE resources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name varchar(120) NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, id)
      )`);

    await q.query(`
      CREATE TABLE services (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name varchar(120) NOT NULL,
        description text,
        duration_minutes int NOT NULL CHECK (duration_minutes > 0),
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, id)
      )`);

    // Local wall-clock hours in the tenant's timezone; several intervals per day allowed.
    await q.query(`
      CREATE TABLE business_hours (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        open_time time NOT NULL,
        close_time time NOT NULL,
        CHECK (close_time > open_time)
      )`);
    await q.query(`CREATE INDEX idx_business_hours_tenant ON business_hours (tenant_id, day_of_week)`);

    // Empty until telephony exists; the phone path resolves tenant through this.
    await q.query(`
      CREATE TABLE phone_numbers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        e164 varchar(20) NOT NULL UNIQUE,
        provider varchar(32) NOT NULL,
        provider_number_id varchar(128),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);

    // The server-side source of truth for "which tenant is this call".
    await q.query(`
      CREATE TABLE calls (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        retell_call_id varchar(128) NOT NULL UNIQUE,
        source varchar(16) NOT NULL CHECK (source IN ('web_test','phone')),
        from_number varchar(20),
        to_number varchar(20),
        status varchar(16) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','ended')),
        started_at timestamptz NOT NULL DEFAULT now(),
        ended_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, id)
      )`);

    await q.query(`
      CREATE TABLE bookings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        resource_id uuid NOT NULL,
        service_id uuid NOT NULL,
        call_id uuid,
        customer_name varchar(200),
        customer_phone varchar(32),
        notes text,
        starts_at timestamptz NOT NULL,
        ends_at timestamptz NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'held'
          CHECK (status IN ('held','confirmed','expired','cancelled','completed','no_show')),
        hold_expires_at timestamptz,
        calendar_sync_status varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (calendar_sync_status IN ('pending','synced','failed')),
        calendar_event_id varchar(255),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (ends_at > starts_at),
        CHECK (status <> 'held' OR hold_expires_at IS NOT NULL),
        CHECK (status <> 'confirmed' OR customer_name IS NOT NULL),
        FOREIGN KEY (tenant_id, resource_id) REFERENCES resources (tenant_id, id),
        FOREIGN KEY (tenant_id, service_id) REFERENCES services (tenant_id, id),
        FOREIGN KEY (tenant_id, call_id) REFERENCES calls (tenant_id, id),
        CONSTRAINT no_overlapping_bookings EXCLUDE USING gist (
          tenant_id WITH =,
          resource_id WITH =,
          tstzrange(starts_at, ends_at) WITH &&
        ) WHERE (status IN ('held','confirmed'))
      )`);
    await q.query(`CREATE INDEX idx_bookings_tenant_start ON bookings (tenant_id, starts_at)`);
    await q.query(
      `CREATE INDEX idx_bookings_hold_expiry ON bookings (hold_expires_at) WHERE status = 'held'`,
    );

    // Messages and transfer requests (no live transfer until telephony exists).
    await q.query(`
      CREATE TABLE messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        call_id uuid,
        kind varchar(24) NOT NULL DEFAULT 'message' CHECK (kind IN ('message','transfer_request')),
        caller_name varchar(200),
        caller_phone varchar(32),
        body text NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','handled')),
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, call_id) REFERENCES calls (tenant_id, id)
      )`);
    await q.query(`CREATE INDEX idx_messages_tenant_status ON messages (tenant_id, status, created_at DESC)`);

    // Backfill: one default resource for tenants that already exist.
    await q.query(`INSERT INTO resources (tenant_id, name) SELECT id, 'Default' FROM tenants`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS messages`);
    await q.query(`DROP TABLE IF EXISTS bookings`);
    await q.query(`DROP TABLE IF EXISTS calls`);
    await q.query(`DROP TABLE IF EXISTS phone_numbers`);
    await q.query(`DROP TABLE IF EXISTS business_hours`);
    await q.query(`DROP TABLE IF EXISTS services`);
    await q.query(`DROP TABLE IF EXISTS resources`);
    await q.query(`ALTER TABLE tenants DROP COLUMN IF EXISTS timezone`);
  }
}
