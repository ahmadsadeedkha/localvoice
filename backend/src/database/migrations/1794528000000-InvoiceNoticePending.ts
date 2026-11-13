import { MigrationInterface, QueryRunner } from 'typeorm';
export class InvoiceNoticePending1794528000000 implements MigrationInterface {
  name = 'InvoiceNoticePending1794528000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE invoices ADD COLUMN issue_notice_pending boolean NOT NULL DEFAULT false`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE invoices DROP COLUMN issue_notice_pending`);
  }
}
