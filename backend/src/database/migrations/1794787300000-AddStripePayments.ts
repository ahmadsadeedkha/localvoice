import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStripePayments1794787300000 implements MigrationInterface {
  name = 'AddStripePayments1794787300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD COLUMN "stripe_customer_id" varchar UNIQUE`,
    );

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "provider" varchar NOT NULL,
        "provider_session_id" varchar,
        "provider_payment_id" varchar,
        "amount_cents" integer NOT NULL CHECK ("amount_cents" > 0),
        "currency" varchar(3) NOT NULL DEFAULT 'usd',
        "status" varchar NOT NULL DEFAULT 'pending',
        "credited_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_payments_provider_session"
          UNIQUE ("provider", "provider_session_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_payments_tenant" ON "payments" ("tenant_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP COLUMN "stripe_customer_id"`,
    );
  }
}
