import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingCalendarDestination1794400000000 implements MigrationInterface {
  name = 'BookingCalendarDestination1794400000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE bookings ADD COLUMN calendar_id varchar(255) NULL`,
    );
    // The selected calendar is the only destination available for legacy rows.
    await q.query(`UPDATE bookings b SET calendar_id = g.calendar_id
      FROM google_calendar_connections g
      WHERE g.tenant_id = b.tenant_id AND b.calendar_event_id IS NOT NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE bookings DROP COLUMN calendar_id`);
  }
}
