import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numeric } from '../common/numeric.transformer';

export enum InvoiceStatus {
  Open = 'open',
  Paid = 'paid',
  Void = 'void',
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;

  @Column({ name: 'period_start', type: 'timestamptz' }) periodStart: Date;

  @Column({ name: 'period_end', type: 'timestamptz' }) periodEnd: Date;

  @Column({
    name: 'credits_used',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numeric,
  })
  creditsUsed: number;

  @Column({
    name: 'price_per_credit',
    type: 'numeric',
    precision: 14,
    scale: 4,
    nullable: true,
    transformer: numeric,
  })
  pricePerCredit: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numeric,
  })
  amount: number | null;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    enumName: 'invoice_status_enum',
    default: InvoiceStatus.Open,
  })
  status: InvoiceStatus;

  @Column({ name: 'issued_at', type: 'timestamptz', default: () => 'now()' })
  issuedAt: Date;

  @Column({ name: 'due_at', type: 'timestamptz' }) dueAt: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  // reference the admin typed when marking it paid (e.g. a bank transfer id)
  @Column({ name: 'payment_ref', type: 'varchar', length: 150, nullable: true })
  paymentRef: string | null;

  @Column({ name: 'reminder_3d_sent_at', type: 'timestamptz', nullable: true })
  reminder3dSentAt: Date | null;

  @Column({ name: 'reminder_1d_sent_at', type: 'timestamptz', nullable: true })
  reminder1dSentAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
