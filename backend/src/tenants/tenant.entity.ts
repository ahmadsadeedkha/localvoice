import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TenantStatus {
  Trial = 'trial',
  Active = 'active',
  Suspended = 'suspended',
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  slug!: string;

  @Column({ type: 'varchar', nullable: true })
  industry!: string | null;

  @Column({ type: 'varchar', default: 'UTC' })
  timezone!: string;

  @Column({ name: 'business_phone', type: 'varchar', nullable: true })
  businessPhone!: string | null;

  @Index({ unique: true })
  @Column({ name: 'twilio_number', type: 'varchar', nullable: true })
  twilioNumber!: string | null;

  @Column({ name: 'retell_agent_id', type: 'varchar', nullable: true })
  retellAgentId!: string | null;

  @Index({ unique: true })
  @Column({ name: 'clerk_org_id', type: 'varchar', nullable: true })
  clerkOrgId!: string | null;

  @Column({ type: 'varchar', default: TenantStatus.Trial })
  status!: TenantStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
