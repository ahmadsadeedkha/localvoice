import { MigrationInterface, QueryRunner } from "typeorm";

export class CoreTables1791971625685 implements MigrationInterface {
    name = 'CoreTables1791971625685'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "industry" character varying, "timezone" character varying NOT NULL DEFAULT 'UTC', "business_phone" character varying, "twilio_number" character varying, "retell_agent_id" character varying, "clerk_org_id" character varying, "status" character varying NOT NULL DEFAULT 'trial', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2310ecc5cb8be427097154b18f" ON "tenants"  ("slug") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_1dbeeaafdbc397cbc2265ff1b9" ON "tenants"  ("twilio_number") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_2b0531b4be74ca2c1f414ea42a" ON "tenants"  ("clerk_org_id") `);
        await queryRunner.query(`CREATE TABLE "tenant_members" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "clerk_user_id" character varying NOT NULL, "email" character varying, "name" character varying, "role" character varying NOT NULL DEFAULT 'staff', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2cc5bca9bcfcce498c36d383052" UNIQUE ("tenant_id", "clerk_user_id"), CONSTRAINT "PK_f698fea03ae8f690b936971aa99" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_007ff09b810c928757e6ac35bc" ON "tenant_members"  ("clerk_user_id") `);
        await queryRunner.query(`CREATE TABLE "webhook_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "provider" character varying NOT NULL, "external_event_id" character varying NOT NULL, "event_type" character varying, "payload" jsonb NOT NULL, "status" character varying NOT NULL DEFAULT 'received', "error" text, "tenant_id" uuid, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "processed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_3be1ff505bee133163c6e85fd2c" UNIQUE ("provider", "external_event_id"), CONSTRAINT "PK_4cba37e6a0acb5e1fc49c34ebfd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_53162be4d833f3b0c6f487d433" ON "webhook_events"  ("status", "received_at") `);
        await queryRunner.query(`ALTER TABLE "tenant_members" ADD CONSTRAINT "FK_ffba0c9ecd4fd98550b3300ae68" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tenant_members" DROP CONSTRAINT "FK_ffba0c9ecd4fd98550b3300ae68"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_53162be4d833f3b0c6f487d433"`);
        await queryRunner.query(`DROP TABLE "webhook_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_007ff09b810c928757e6ac35bc"`);
        await queryRunner.query(`DROP TABLE "tenant_members"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2b0531b4be74ca2c1f414ea42a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1dbeeaafdbc397cbc2265ff1b9"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2310ecc5cb8be427097154b18f"`);
        await queryRunner.query(`DROP TABLE "tenants"`);
    }

}
