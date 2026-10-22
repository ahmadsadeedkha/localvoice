import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { type BookingStatus, type CalendarSyncStatus } from './booking-status';

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'resource_id', type: 'uuid' }) resourceId: string;
  @Column({ name: 'service_id', type: 'uuid' }) serviceId: string;
  @Column({ name: 'call_id', type: 'uuid', nullable: true }) callId:
    string | null;
  @Column({
    name: 'customer_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  customerName: string | null;
  @Column({
    name: 'customer_phone',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  customerPhone: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ name: 'starts_at', type: 'timestamptz' }) startsAt: Date;
  @Column({ name: 'ends_at', type: 'timestamptz' }) endsAt: Date;
  @Column({ type: 'varchar', length: 16, default: 'held' })
  status: BookingStatus;
  @Column({ name: 'hold_expires_at', type: 'timestamptz', nullable: true })
  holdExpiresAt: Date | null;
  @Column({
    name: 'calendar_sync_status',
    type: 'varchar',
    length: 16,
    default: 'pending',
  })
  calendarSyncStatus: CalendarSyncStatus;
  @Column({
    name: 'calendar_event_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  calendarEventId: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
