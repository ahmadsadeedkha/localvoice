import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('business_hours')
export class BusinessHours {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  /** 0 = Sunday ... 6 = Saturday, local to the tenant's timezone */
  @Column({ name: 'day_of_week', type: 'smallint' }) dayOfWeek: number;
  /** 'HH:MM:SS' */
  @Column({ name: 'open_time', type: 'time' }) openTime: string;
  @Column({ name: 'close_time', type: 'time' }) closeTime: string;
}
