import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum MemberRole {
  Owner = 'owner',
  Admin = 'admin',
  Staff = 'staff',
}

@Entity('tenant_members')
@Unique(['tenantId', 'clerkUserId'])
@Index(['clerkUserId'])
export class TenantMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'clerk_user_id', type: 'varchar' })
  clerkUserId!: string;

  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', default: MemberRole.Staff })
  role!: MemberRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
