import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** active: usable. revoked: user disconnected or Google returned invalid_grant (must reconnect). */
export type GoogleConnectionStatus = 'active' | 'revoked';

/** One Google Calendar per business (tenant_id is UNIQUE). */
@Entity('google_calendar_connections')
export class GoogleCalendarConnection {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'google_email', type: 'varchar', length: 320 })
  googleEmail: string;
  /** Never select this into API responses. Decrypt only inside the Google service. */
  @Column({ name: 'refresh_token_enc', type: 'text', select: false })
  refreshTokenEnc: string;
  @Column({ type: 'text' }) scopes: string;
  /** null until the business picks which calendar to use. */
  @Column({ name: 'calendar_id', type: 'varchar', length: 255, nullable: true })
  calendarId: string | null;
  @Column({
    name: 'calendar_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  calendarName: string | null;
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: GoogleConnectionStatus;
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;
  @Column({ name: 'connected_by_user_id', type: 'varchar', length: 64 })
  connectedByUserId: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
