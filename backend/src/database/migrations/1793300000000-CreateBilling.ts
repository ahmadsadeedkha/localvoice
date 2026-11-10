import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBilling1793300000000 implements MigrationInterface {
  name = 'CreateBilling1793300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE billing_mode_enum AS ENUM ('prepaid', 'postpaid')`,
    );
    await q.query(
      `CREATE TYPE blocked_reason_enum AS ENUM ('no_balance', 'invoice_unpaid')`,
    );
    await q.query(`
      CREATE TYPE ledger_type_enum AS ENUM
      ('purchase', 'call_charge', 'refund', 'adjustment', 'grant', 'expiry')
    `);

    await q.query(`
      CREATE TABLE tenant_wallets (
        tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        billing_mode billing_mode_enum NOT NULL DEFAULT 'prepaid',
        balance_credits numeric(14,2) NOT NULL DEFAULT 0,
        credit_limit numeric(14,2) NOT NULL DEFAULT 0,
        low_balance_threshold numeric(14,2) NOT NULL DEFAULT 10,
        low_balance_notified_at timestamptz NULL,
        blocked_reason blocked_reason_enum NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT credit_limit_non_negative CHECK (credit_limit >= 0)
      )
    `);

    await q.query(`
      CREATE TABLE credit_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        type ledger_type_enum NOT NULL,
        credits numeric(14,2) NOT NULL,
        balance_after numeric(14,2) NOT NULL,
        call_id varchar(100) NULL,
        payment_ref varchar(150) NULL,
        provider_cost_cents integer NULL,
        note text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT call_charge_needs_call_id
          CHECK (type <> 'call_charge' OR call_id IS NOT NULL),
        CONSTRAINT purchase_needs_payment_ref
          CHECK (type <> 'purchase' OR payment_ref IS NOT NULL)
      )
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_ledger_type_call
      ON credit_ledger (type, call_id) WHERE call_id IS NOT NULL
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_ledger_type_payment
      ON credit_ledger (type, payment_ref) WHERE payment_ref IS NOT NULL
    `);
    await q.query(`
      CREATE INDEX idx_ledger_tenant_created
      ON credit_ledger (tenant_id, created_at DESC)
    `);

    // wallets for tenants that already exist
    await q.query(`
      INSERT INTO tenant_wallets (tenant_id)
      SELECT id FROM tenants
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS credit_ledger`);
    await q.query(`DROP TABLE IF EXISTS tenant_wallets`);
    await q.query(`DROP TYPE IF EXISTS ledger_type_enum`);
    await q.query(`DROP TYPE IF EXISTS blocked_reason_enum`);
    await q.query(`DROP TYPE IF EXISTS billing_mode_enum`);
  }
}
