import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePostpaid1793400000000 implements MigrationInterface {
  name = 'CreatePostpaid1793400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE tenant_wallets
        ADD COLUMN price_per_credit numeric(14,4) NULL,
        ADD COLUMN currency varchar(3) NULL,
        ADD COLUMN invoice_due_days integer NOT NULL DEFAULT 7,
        ADD CONSTRAINT invoice_due_days_positive CHECK (invoice_due_days > 0)
    `);

    await q.query(
      `CREATE TYPE invoice_status_enum AS ENUM ('open', 'paid', 'void')`,
    );

    await q.query(`
      CREATE TABLE invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        period_start timestamptz NOT NULL,
        period_end timestamptz NOT NULL,
        credits_used numeric(14,2) NOT NULL,
        price_per_credit numeric(14,4) NULL,
        currency varchar(3) NULL,
        amount numeric(14,2) NULL,
        status invoice_status_enum NOT NULL DEFAULT 'open',
        issued_at timestamptz NOT NULL DEFAULT now(),
        due_at timestamptz NOT NULL,
        paid_at timestamptz NULL,
        payment_ref varchar(150) NULL,
        reminder_3d_sent_at timestamptz NULL,
        reminder_1d_sent_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT invoice_credits_positive CHECK (credits_used > 0)
      )
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_invoices_tenant_period
      ON invoices (tenant_id, period_start)
    `);
    await q.query(`
      CREATE INDEX idx_invoices_status_due ON invoices (status, due_at)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS invoices`);
    await q.query(`DROP TYPE IF EXISTS invoice_status_enum`);
    await q.query(`
      ALTER TABLE tenant_wallets
        DROP CONSTRAINT IF EXISTS invoice_due_days_positive,
        DROP COLUMN IF EXISTS invoice_due_days,
        DROP COLUMN IF EXISTS currency,
        DROP COLUMN IF EXISTS price_per_credit
    `);
  }
}
