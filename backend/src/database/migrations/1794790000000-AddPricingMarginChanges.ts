import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPricingMarginChanges1794790000000 implements MigrationInterface {
  name = 'AddPricingMarginChanges1794790000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pricing_margin_changes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "margin_per_minute" numeric(8,4) NOT NULL
          CHECK ("margin_per_minute" >= 0),
        "changed_by" varchar NOT NULL,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_pricing_margin_changes_created"
         ON "pricing_margin_changes" ("created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "pricing_margin_changes"`);
  }
}
