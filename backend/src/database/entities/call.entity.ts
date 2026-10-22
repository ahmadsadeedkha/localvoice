import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('calls')
export class Call {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'retell_call_id', type: 'varchar', length: 128, unique: true }) retellCallId: string;
  @Column({ type: 'varchar', length: 16 }) source: 'web_test' | 'phone';
  @Column({ name: 'from_number', type: 'varchar', length: 20, nullable: true }) fromNumber: string | null;
  @Column({ name: 'to_number', type: 'varchar', length: 20, nullable: true }) toNumber: string | null;
  @Column({ type: 'varchar', length: 16, default: 'in_progress' }) status: 'in_progress' | 'ended';
  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' }) startedAt: Date;
  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true }) endedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
