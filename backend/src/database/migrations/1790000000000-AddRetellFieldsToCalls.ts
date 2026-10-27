import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetellFieldsToCalls1790000000000 implements MigrationInterface {
  name = 'AddRetellFieldsToCalls1790000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "calls"
        ADD COLUMN "duration_ms" integer,
        ADD COLUMN "disconnection_reason" varchar(64),
        ADD COLUMN "transcript" text,
        ADD COLUMN "summary" text,
        ADD COLUMN "sentiment" varchar(32),
        ADD COLUMN "call_successful" boolean,
        ADD COLUMN "analysis" jsonb
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "calls"
        DROP COLUMN "analysis",
        DROP COLUMN "call_successful",
        DROP COLUMN "sentiment",
        DROP COLUMN "summary",
        DROP COLUMN "transcript",
        DROP COLUMN "disconnection_reason",
        DROP COLUMN "duration_ms"
    `);
  }
}
