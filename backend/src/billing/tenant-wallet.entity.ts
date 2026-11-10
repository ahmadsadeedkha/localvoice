import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { numeric } from '../common/numeric.transformer';

@Entity('tenant_wallets')
export class TenantWallet {
  @PrimaryColumn('uuid', { name: 'tenant_id' }) tenantId: string;
  @Column({
    name: 'billing_mode',
    type: 'enum',
    enum: ['prepaid', 'postpaid'],
    enumName: 'billing_mode_enum',
  })
  billingMode: 'prepaid' | 'postpaid';
  @Column({
    name: 'balance_credits',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numeric,
  })
  balanceCredits: number;
  @Column({
    name: 'credit_limit',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numeric,
  })
  creditLimit: number;
  @Column({
    name: 'low_balance_threshold',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numeric,
  })
  lowBalanceThreshold: number;
  @Column({
    name: 'low_balance_notified_at',
    type: 'timestamptz',
    nullable: true,
  })
  lowBalanceNotifiedAt: Date | null;
  @Column({
    name: 'blocked_reason',
    type: 'enum',
    enum: ['no_balance', 'invoice_unpaid'],
    enumName: 'blocked_reason_enum',
    nullable: true,
  })
  blockedReason: 'no_balance' | 'invoice_unpaid' | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
