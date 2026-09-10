import { z } from 'zod'

export const organizationRoleSchema = z.enum(['owner', 'admin', 'operator', 'member'])
export type OrganizationRole = z.infer<typeof organizationRoleSchema>
export type OrganizationAction = 'read' | 'manage_members' | 'manage_structure' | 'manage_nodes' | 'submit_task' | 'view_audit'

const roleActions: Record<OrganizationRole, readonly OrganizationAction[]> = {
  owner: ['read', 'manage_members', 'manage_structure', 'manage_nodes', 'submit_task', 'view_audit'],
  admin: ['read', 'manage_members', 'manage_structure', 'manage_nodes', 'submit_task', 'view_audit'],
  operator: ['read', 'manage_nodes', 'submit_task'],
  member: ['read', 'submit_task'],
}

export function canOrganization(role: OrganizationRole, action: OrganizationAction) {
  return roleActions[role].includes(action)
}
