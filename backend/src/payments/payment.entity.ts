import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PaymentStatus = 'pending' | 'paid' | 'expired';

@Entity({ name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar' })
  provider!: string;

  @Column({ name: 'provider_session_id', type: 'varchar', nullable: true })
  providerSessionId!: string | null;

  @Column({ name: 'provider_payment_id', type: 'varchar', nullable: true })
  providerPaymentId!: string | null;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  @Column({ type: 'varchar', length: 3, default: 'usd' })
  currency!: string;

  @Column({ type: 'varchar', default: 'pending' })
  status!: PaymentStatus;

  @Column({ name: 'credited_at', type: 'timestamptz', nullable: true })
  creditedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
