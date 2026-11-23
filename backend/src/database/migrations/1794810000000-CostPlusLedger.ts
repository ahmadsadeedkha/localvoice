import { MigrationInterface, QueryRunner } from 'typeorm';

export class CostPlusLedger1794810000000 implements MigrationInterface {
  name = 'CostPlusLedger1794810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Retell reports fractions of a cent (e.g. 24.6367), so the integer column goes
    await queryRunner.query(
      `ALTER TABLE "credit_ledger" ALTER COLUMN "provider_cost_cents" TYPE numeric(12,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "credit_ledger" ADD COLUMN "margin_per_minute" numeric(8,4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "credit_ledger" ADD COLUMN "duration_seconds" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "credit_ledger" DROP COLUMN "duration_seconds"`,
    );
    await queryRunner.query(
      `ALTER TABLE "credit_ledger" DROP COLUMN "margin_per_minute"`,
    );
    await queryRunner.query(
      `ALTER TABLE "credit_ledger" ALTER COLUMN "provider_cost_cents" TYPE integer
         USING round("provider_cost_cents")::integer`,
    );
  }
}