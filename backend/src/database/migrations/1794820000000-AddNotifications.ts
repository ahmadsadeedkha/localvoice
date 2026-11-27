import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotifications1794820000000 implements MigrationInterface {
  name = 'AddNotifications1794820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "type" varchar(40) NOT NULL,
        "title" varchar(200) NOT NULL,
        "body" text NOT NULL,
        "link" varchar(200),
        "dedupe_key" varchar(200),
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_tenant_created"
         ON "notifications" ("tenant_id", "created_at" DESC)`,
    );
    // a retried queue job must not create the same notification twice
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_notifications_dedupe"
         ON "notifications" ("tenant_id", "dedupe_key")
         WHERE "dedupe_key" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
