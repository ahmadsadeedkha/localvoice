import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameTwilioToTelnyx1794800000000 implements MigrationInterface {
  name = 'RenameTwilioToTelnyx1794800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" RENAME COLUMN "twilio_number" TO "telnyx_number"`,
    );
    // TypeORM derives index names from table + column names, so rename the
    // unique index too, or the next migration:generate wants to recreate it
    await queryRunner.query(
      `ALTER INDEX "IDX_1dbeeaafdbc397cbc2265ff1b9"
         RENAME TO "IDX_14155679883ea033db61400268"`,
    );
    await queryRunner.query(
      `UPDATE "webhook_events" SET "provider" = 'telnyx' WHERE "provider" = 'twilio'`,
    );
    await queryRunner.query(
      `UPDATE "phone_numbers" SET "provider" = 'telnyx' WHERE "provider" = 'twilio'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER INDEX "IDX_14155679883ea033db61400268"
         RENAME TO "IDX_1dbeeaafdbc397cbc2265ff1b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" RENAME COLUMN "telnyx_number" TO "twilio_number"`,
    );
    // the provider values are not reverted: rows can't be told apart afterwards
  }
}
