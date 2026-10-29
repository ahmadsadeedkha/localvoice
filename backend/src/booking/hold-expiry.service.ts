import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HoldExpiryService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * held -> expired for every hold past its deadline, freeing its time slot
   * (the no_overlapping_bookings constraint treats 'held' as occupying it).
   *
   * One atomic UPDATE: if a booking is being confirmed at the same moment, the
   * UPDATE waits on that row's lock and then no longer sees status = 'held', so
   * a confirmed booking can never be expired by mistake.
   *
   * Returns how many holds were expired.
   */
  async expireStaleHolds(): Promise<number> {
    const rows = await this.ds.query(
      `UPDATE bookings
       SET status = 'expired', updated_at = now()
       WHERE status = 'held' AND hold_expires_at < now()
       RETURNING id`,
    );
    return rows.length;
  }
}
