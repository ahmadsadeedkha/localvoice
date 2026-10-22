import { MemberRole } from '../tenants/tenant-member.entity';

// Maps a Clerk organization role to our own role. Shared by the auth guard
// (live session) and the Clerk webhook handler (membership sync).
export function mapOrgRole(orgRole?: string | null): MemberRole | null {
  switch (orgRole) {
    case 'org:owner':
      return MemberRole.Owner;
    case 'org:admin':
      return MemberRole.Admin;
    case 'org:staff':
    case 'org:member':
      return MemberRole.Staff;
    default:
      return null;
  }
}
