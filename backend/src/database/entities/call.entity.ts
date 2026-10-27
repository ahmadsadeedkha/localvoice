import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('calls')
export class Call {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({
    name: 'retell_call_id',
    type: 'varchar',
    length: 128,
    unique: true,
  })
  retellCallId: string;
  @Column({ type: 'varchar', length: 16 }) source: 'web_test' | 'phone';
  @Column({ name: 'from_number', type: 'varchar', length: 20, nullable: true })
  fromNumber: string | null;
  @Column({ name: 'to_number', type: 'varchar', length: 20, nullable: true })
  toNumber: string | null;
  @Column({ type: 'varchar', length: 16, default: 'in_progress' }) status:
    'in_progress' | 'ended';
  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @Column({ name: 'duration_ms', type: 'int', nullable: true }) durationMs:
    number | null;
  @Column({
    name: 'disconnection_reason',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  disconnectionReason: string | null;
  @Column({ type: 'text', nullable: true }) transcript: string | null;
  @Column({ type: 'text', nullable: true }) summary: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) sentiment:
    string | null;
  @Column({ name: 'call_successful', type: 'boolean', nullable: true })
  callSuccessful: boolean | null;
  @Column({ type: 'jsonb', nullable: true }) analysis: Record<
    string,
    unknown
  > | null;
}
