import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numeric } from '../common/numeric.transformer';

@Entity('pricing_margin_changes')
export class PricingMarginChange {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({
    name: 'margin_per_minute',
    type: 'numeric',
    precision: 8,
    scale: 4,
    transformer: numeric,
  })
  marginPerMinute: number;
  @Column({ name: 'changed_by', type: 'varchar' }) changedBy: string;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
