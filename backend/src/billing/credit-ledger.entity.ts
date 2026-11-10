import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numeric } from '../common/numeric.transformer';

@Entity('credit_ledger')
export class CreditLedger {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({
    type: 'enum',
    enumName: 'ledger_type_enum',
    enum: [
      'purchase',
      'call_charge',
      'refund',
      'adjustment',
      'grant',
      'expiry',
    ],
  })
  type: string;
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numeric })
  credits: number;
  @Column({
    name: 'balance_after',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numeric,
  })
  balanceAfter: number;
  @Column({ name: 'call_id', type: 'varchar', nullable: true }) callId:
    string | null;
  @Column({ name: 'payment_ref', type: 'varchar', nullable: true }) paymentRef:
    string | null;
  @Column({ name: 'provider_cost_cents', type: 'int', nullable: true })
  providerCostCents: number | null;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
