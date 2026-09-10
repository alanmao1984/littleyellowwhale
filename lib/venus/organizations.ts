import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { Resend } from 'resend'
import { z } from 'zod'
import { db } from '@/lib/db'
import { costCenter, department, organization, organizationAuditEvent, organizationInvite, organizationMember, organizationQuota } from '@/lib/db/schema'
import { generateSecret, hashToken } from './tokens'
import { canOrganization, organizationRoleSchema, type OrganizationAction } from './authorization'
export { canOrganization, organizationRoleSchema } from './authorization'
export type { OrganizationAction, OrganizationRole } from './authorization'

const organizationInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['enterprise', 'school']),
}).strict()

function slugify(name: string) {
  const base = name.normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'workspace'
  return `${base}-${randomUUID().slice(0, 8)}`
}

export async function membership(userId: string, organizationId: string) {
  const [member] = await db.select().from(organizationMember).where(and(eq(organizationMember.organizationId, organizationId), eq(organizationMember.userId, userId), eq(organizationMember.status, 'active'))).limit(1)
  if (!member) return null
  const parsed = organizationRoleSchema.safeParse(member.role)
  return parsed.success ? { ...member, role: parsed.data } : null
}

export async function requireOrganizationAction(userId: string, organizationId: string, action: OrganizationAction) {
  const member = await membership(userId, organizationId)
  return member && canOrganization(member.role, action) ? member : null
}

export async function createOrganization(userId: string, input: unknown) {
  const parsed = organizationInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'invalid_input' as const }
  return db.transaction(async tx => {
    const id = randomUUID()
    const slug = slugify(parsed.data.name)
    await tx.insert(organization).values({ id, ownerId: userId, name: parsed.data.name, slug, type: parsed.data.type, policy: { dispatchDomains: ['organization'], mediaEgress: 'organization_nodes_only' } })
    await tx.insert(organizationMember).values({ id: randomUUID(), organizationId: id, userId, role: 'owner' })
    await tx.insert(organizationAuditEvent).values({ id: randomUUID(), organizationId: id, actorId: userId, action: 'organization.created', targetType: 'organization', targetId: id, summary: { name: parsed.data.name, type: parsed.data.type } })
    return { ok: true as const, organizationId: id }
  })
}

export async function listOrganizations(userId: string) {
  const rows = await db.select({ id: organization.id, name: organization.name, slug: organization.slug, type: organization.type, status: organization.status, role: organizationMember.role, createdAt: organization.createdAt })
    .from(organizationMember).innerJoin(organization, eq(organization.id, organizationMember.organizationId))
    .where(and(eq(organizationMember.userId, userId), eq(organizationMember.status, 'active'))).orderBy(desc(organization.createdAt)).limit(50)
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

const structureSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('department'), name: z.string().trim().min(2).max(80), parentId: z.string().uuid().nullable().default(null) }).strict(),
  z.object({ kind: z.literal('cost_center'), name: z.string().trim().min(2).max(80), code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/), departmentId: z.string().uuid().nullable().default(null) }).strict(),
  z.object({ kind: z.literal('quota'), quotaKind: z.enum(['text_tokens', 'video_seconds', 'concurrency', 'vtest']), limit: z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/), departmentId: z.string().uuid().nullable().default(null), costCenterId: z.string().uuid().nullable().default(null) }).strict(),
])

export async function createOrganizationStructure(userId: string, organizationId: string, input: unknown) {
  const [allowed, parsed] = await Promise.all([requireOrganizationAction(userId, organizationId, 'manage_structure'), Promise.resolve(structureSchema.safeParse(input))])
  if (!allowed) return { ok: false as const, error: 'forbidden' as const }
  if (!parsed.success) return { ok: false as const, error: 'invalid_input' as const }
  return db.transaction(async tx => {
    const id = randomUUID()
    if (parsed.data.kind === 'department') await tx.insert(department).values({ id, organizationId, name: parsed.data.name, parentId: parsed.data.parentId })
    if (parsed.data.kind === 'cost_center') await tx.insert(costCenter).values({ id, organizationId, name: parsed.data.name, code: parsed.data.code.toUpperCase(), departmentId: parsed.data.departmentId })
    if (parsed.data.kind === 'quota') await tx.insert(organizationQuota).values({ id, organizationId, kind: parsed.data.quotaKind, limitValue: parsed.data.limit, departmentId: parsed.data.departmentId, costCenterId: parsed.data.costCenterId })
    await tx.insert(organizationAuditEvent).values({ id: randomUUID(), organizationId, actorId: userId, action: `${parsed.data.kind}.created`, targetType: parsed.data.kind, targetId: id, summary: parsed.data })
    return { ok: true as const, id }
  })
}

const inviteSchema = z.object({ email: z.email().transform(value => value.trim().toLowerCase()), role: z.enum(['admin', 'operator', 'member']) }).strict()
export async function inviteOrganizationMember(userId: string, organizationId: string, input: unknown) {
  const [allowed, parsed] = await Promise.all([requireOrganizationAction(userId, organizationId, 'manage_members'), Promise.resolve(inviteSchema.safeParse(input))])
  if (!allowed) return { ok: false as const, error: 'forbidden' as const }
  if (!parsed.success) return { ok: false as const, error: 'invalid_input' as const }
  const token = generateSecret('voi'); const inviteId = randomUUID(); const expiresAt = new Date(Date.now() + 72 * 60 * 60_000)
  const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, organizationId)).limit(1)
  if (!org) return { ok: false as const, error: 'not_found' as const }
  await db.transaction(async tx => {
    await tx.insert(organizationInvite).values({ id: inviteId, organizationId, email: parsed.data.email, role: parsed.data.role, tokenHash: hashToken(token), expiresAt, invitedBy: userId })
    await tx.insert(organizationAuditEvent).values({ id: randomUUID(), organizationId, actorId: userId, action: 'member.invited', targetType: 'organization_invite', targetId: inviteId, summary: { emailDomain: parsed.data.email.split('@')[1], role: parsed.data.role } })
  })
  const apiKey = process.env.RESEND_API_KEY; const domain = process.env.RESEND_EMAIL_DOMAIN
  if (!apiKey || !domain) return { ok: false as const, error: 'delivery_unavailable' as const }
  const { error } = await new Resend(apiKey).emails.send({ from: `Venus <invites@${domain}>`, to: [parsed.data.email], subject: `加入 ${org.name} 的 Venus 组织算力工作区`, text: `你被邀请以 ${parsed.data.role} 身份加入 ${org.name}。请登录 Venus，在“组织算力”中粘贴以下一次性邀请令牌（72 小时内有效）：\n\n${token}\n\n若你不认识该组织，请忽略此邮件。` }, { idempotencyKey: `organization-invite/${inviteId}` })
  if (error) { await db.update(organizationInvite).set({ revokedAt: new Date() }).where(eq(organizationInvite.id, inviteId)); return { ok: false as const, error: 'delivery_failed' as const } }
  return { ok: true as const, expiresAt: expiresAt.toISOString() }
}

export async function acceptOrganizationInvite(userId: string, email: string, token: string) {
  if (!token.startsWith('voi_')) return { ok: false as const, error: 'invalid_invite' as const }
  return db.transaction(async tx => {
    const [invite] = await tx.select().from(organizationInvite).where(and(eq(organizationInvite.tokenHash, hashToken(token)), isNull(organizationInvite.acceptedAt), isNull(organizationInvite.revokedAt))).for('update').limit(1)
    if (!invite || invite.expiresAt.getTime() <= Date.now() || invite.email !== email.trim().toLowerCase()) return { ok: false as const, error: 'invalid_invite' as const }
    await tx.insert(organizationMember).values({ id: randomUUID(), organizationId: invite.organizationId, userId, role: invite.role }).onConflictDoNothing()
    await tx.update(organizationInvite).set({ acceptedAt: new Date() }).where(eq(organizationInvite.id, invite.id))
    await tx.insert(organizationAuditEvent).values({ id: randomUUID(), organizationId: invite.organizationId, actorId: userId, action: 'member.joined', targetType: 'organization_member', targetId: userId, summary: { role: invite.role } })
    return { ok: true as const, organizationId: invite.organizationId }
  })
}

export async function getOrganizationWorkspace(userId: string, organizationId: string) {
  const allowed = await requireOrganizationAction(userId, organizationId, 'read')
  if (!allowed) return null
  const [orgRows, members, departments, costCenters, quotas, audits] = await Promise.all([
    db.select().from(organization).where(eq(organization.id, organizationId)).limit(1),
    db.select({ id: organizationMember.id, userId: organizationMember.userId, role: organizationMember.role, status: organizationMember.status, createdAt: organizationMember.createdAt }).from(organizationMember).where(eq(organizationMember.organizationId, organizationId)).limit(200),
    db.select().from(department).where(eq(department.organizationId, organizationId)).limit(200),
    db.select().from(costCenter).where(eq(costCenter.organizationId, organizationId)).limit(200),
    db.select().from(organizationQuota).where(eq(organizationQuota.organizationId, organizationId)).limit(200),
    db.select().from(organizationAuditEvent).where(eq(organizationAuditEvent.organizationId, organizationId)).orderBy(desc(organizationAuditEvent.createdAt)).limit(30),
  ])
  if (!orgRows[0]) return null
  return { organization: orgRows[0], currentRole: allowed.role, members, departments, costCenters, quotas, audits }
}
