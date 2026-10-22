import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ name: 'call_id', type: 'uuid', nullable: true }) callId: string | null;
  @Column({ type: 'varchar', length: 24, default: 'message' }) kind: 'message' | 'transfer_request';
  @Column({ name: 'caller_name', type: 'varchar', length: 200, nullable: true }) callerName: string | null;
  @Column({ name: 'caller_phone', type: 'varchar', length: 32, nullable: true }) callerPhone: string | null;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'varchar', length: 16, default: 'new' }) status: 'new' | 'read' | 'handled';
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
