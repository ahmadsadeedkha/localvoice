import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('phone_numbers')
export class PhoneNumber {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id', type: 'uuid' }) tenantId: string;
  @Column({ type: 'varchar', length: 20, unique: true }) e164: string;
  @Column({ type: 'varchar', length: 32 }) provider: string;
  @Column({ name: 'provider_number_id', type: 'varchar', length: 128, nullable: true })
  providerNumberId: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
