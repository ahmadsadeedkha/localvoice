import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum WebhookProvider {
  Retell = 'retell',
  Twilio = 'twilio',
  Google = 'google',
  Clerk = 'clerk',
}

export enum WebhookEventStatus {
  Received = 'received',
  Processed = 'processed',
  Failed = 'failed',
}

@Entity('webhook_events')
@Unique(['provider', 'externalEventId'])
@Index(['status', 'receivedAt'])
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  provider!: WebhookProvider;

  @Column({ name: 'external_event_id', type: 'varchar' })
  externalEventId!: string;

  @Column({ name: 'event_type', type: 'varchar', nullable: true })
  eventType!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', default: WebhookEventStatus.Received })
  status!: WebhookEventStatus;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  // Filled in once the tenant is resolved; informational only, deliberately no FK
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
}
