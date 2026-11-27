import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ type: 'varchar', length: 40 }) type: string;
  @Column({ type: 'varchar', length: 200 }) title: string;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) link: string | null;
  @Column({ name: 'dedupe_key', type: 'varchar', length: 200, nullable: true })
  dedupeKey: string | null;
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
