import { randomUUID } from 'crypto'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { apiToken, enrollmentIntent, node, nodeHeartbeat, nodeIdentity } from '@/lib/db/schema'
import { generatePairingCode, generateSecret, hashToken } from './tokens'
import { heartbeatSchema, readPolicy, resourcePolicySchema, type ResourcePolicy } from '@/packages/node-protocol'

const ONLINE_WINDOW_MS = 90_000
const INTENT_TTL_MS = 15 * 60_000
const PLATFORMS = new Set(['windows', 'macos'])

export type NodeView = {
  id: string
  name: string
  platform: string
  status: string
  online: boolean
  lastSeenAt: string | null
  cpu: string | null
  vram: number | null
  models: string[]
  capabilities: import('@/packages/node-protocol').Capability[]
  hardware: import('@/packages/node-protocol').HardwareProfile | null
  hermes: import('@/packages/node-protocol').HermesStatus | null
  policy: ResourcePolicy
  createdAt: string
}

export type EnrollmentView = { id: string; platform: string; nodeName: string; expiresAt: string }
export type ApiTokenView = { id: string; name: string; scope: string; organizationId: string | null; expiresAt: string | null; lastUsedAt: string | null; createdAt: string }

// --- Enrollment (user side) ---------------------------------------------------

export async function createEnrollmentIntent(
  userId: string,
  input: { platform: string; nodeName: string },
): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; error: 'invalid_input' }> {
  const platform = String(input.platform)
  const nodeName = String(input.nodeName ?? '').trim().slice(0, 60) || 'My node'
  if (!PLATFORMS.has(platform)) return { ok: false, error: 'invalid_input' }
  const { code, codeHash } = generatePairingCode()
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS)
  await db.insert(enrollmentIntent).values({ id: randomUUID(), userId, codeHash, platform, nodeName, expiresAt })
  return { ok: true, code, expiresAt: expiresAt.toISOString() }
}

export async function listEnrollmentIntents(userId: string): Promise<EnrollmentView[]> {
  const now = new Date()
  const rows = await db
    .select()
    .from(enrollmentIntent)
    .where(and(eq(enrollmentIntent.userId, userId), isNull(enrollmentIntent.consumedAt), gt(enrollmentIntent.expiresAt, now)))
    .orderBy(desc(enrollmentIntent.createdAt))
    .limit(20)
  return rows.map((row) => ({ id: row.id, platform: row.platform, nodeName: row.nodeName, expiresAt: row.expiresAt.toISOString() }))
}

// --- Enrollment (node side) ---------------------------------------------------
// Called by the internal enroll endpoint. The pairing code proves the logged-in
// user authorized this node, so there is no user session here. The code is
// single-use and time-boxed; consuming it and minting the identity are atomic.

export type EnrollResult =
  | { ok: true; nodeToken: string; nodeId: string; name: string }
  | { ok: false; error: 'invalid_code' | 'expired' | 'already_used' }

export async function enrollNode(code: string): Promise<EnrollResult> {
  const codeHash = hashToken(code)
  return db.transaction(async (tx) => {
    const [intent] = await tx.select().from(enrollmentIntent).where(eq(enrollmentIntent.codeHash, codeHash)).for('update').limit(1)
    if (!intent) return { ok: false as const, error: 'invalid_code' as const }
    if (intent.consumedAt) return { ok: false as const, error: 'already_used' as const }
    if (intent.expiresAt.getTime() < Date.now()) return { ok: false as const, error: 'expired' as const }
    const nodeId = randomUUID()
    const nodeToken = generateSecret('vn')
    await tx.insert(node).values({ id: nodeId, userId: intent.userId, name: intent.nodeName, platform: intent.platform, status: 'enrolled' })
    await tx.insert(nodeIdentity).values({ id: randomUUID(), nodeId, userId: intent.userId, tokenHash: hashToken(nodeToken) })
    await tx.update(enrollmentIntent).set({ consumedAt: new Date(), nodeId }).where(eq(enrollmentIntent.id, intent.id))
    return { ok: true as const, nodeToken, nodeId, name: intent.nodeName }
  })
}

// Resolves a node bearer token to its identity. Revoked identities and revoked
// nodes are rejected so a node can only ever act as itself.
export async function resolveNodeToken(token: string): Promise<{ nodeId: string; userId: string } | null> {
  const [identity] = await db.select().from(nodeIdentity).where(and(eq(nodeIdentity.tokenHash, hashToken(token)), eq(nodeIdentity.revoked, false))).limit(1)
  if (!identity) return null
  const [n] = await db.select().from(node).where(and(eq(node.id, identity.nodeId), eq(node.userId, identity.userId))).limit(1)
  if (!n || n.status === 'revoked') return null
  return { nodeId: identity.nodeId, userId: identity.userId }
}

export type HeartbeatInput = { cpu?: number | null; vram?: number | null; models?: string[] | null; capabilities?: import('@/packages/node-protocol').Capability[]; hardware?: import('@/packages/node-protocol').HardwareProfile; hermes?: import('@/packages/node-protocol').HermesStatus; attestationPublicKey?: string }

export async function recordHeartbeat(nodeId: string, userId: string, input: HeartbeatInput) {
  const parsed = heartbeatSchema.parse(input)
  return db.transaction(async tx => {
    const [n] = await tx.select().from(node).where(and(eq(node.id, nodeId), eq(node.userId, userId))).for('update').limit(1)
    if (!n || n.status === 'revoked') return { status: 'revoked', policy: readPolicy(null) }
    const now = new Date()
    const telemetry = { lastSeenAt: now, cpu: parsed.cpu?.toFixed(2) ?? null, vram: parsed.vram ?? null, models: parsed.models ?? [], capabilities: parsed.capabilities, hardware: parsed.hardware ?? null, hermes: parsed.hermes ?? null, attestationPublicKey: parsed.attestationPublicKey ?? null, updatedAt: now }
    await tx.insert(nodeHeartbeat).values({ id: randomUUID(), nodeId, userId, ...telemetry })
      .onConflictDoUpdate({ target: nodeHeartbeat.nodeId, set: telemetry })
    return { status: n.status, policy: readPolicy(n.resourcePolicy) }
  })
}

export async function saveNodePolicy(userId: string, nodeId: string, input: unknown) {
  const parsed = resourcePolicySchema.safeParse(input)
  if (!parsed.success) return { ok: false as const }
  return db.transaction(async tx => {
    const [n] = await tx.select().from(node).where(and(eq(node.id, nodeId), eq(node.userId, userId))).for('update').limit(1)
    if (!n || n.status === 'revoked') return { ok: false as const }
    await tx.update(node).set({ resourcePolicy: parsed.data }).where(and(eq(node.id, nodeId), eq(node.userId, userId)))
    return { ok: true as const }
  })
}

// --- Node management (user side) ---------------------------------------------

export async function listNodes(userId: string): Promise<NodeView[]> {
  const rows = await db
    .select({
      id: node.id,
      name: node.name,
      platform: node.platform,
      status: node.status,
      createdAt: node.createdAt,
      lastSeenAt: nodeHeartbeat.lastSeenAt,
      cpu: nodeHeartbeat.cpu,
      vram: nodeHeartbeat.vram,
      models: nodeHeartbeat.models,
      capabilities: nodeHeartbeat.capabilities,
      hardware: nodeHeartbeat.hardware,
      hermes: nodeHeartbeat.hermes,
      policy: node.resourcePolicy,
    })
    .from(node)
    .leftJoin(nodeHeartbeat, eq(nodeHeartbeat.nodeId, node.id))
    .where(eq(node.userId, userId))
    .orderBy(desc(node.createdAt))
    .limit(50)
  const now = Date.now()
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    platform: row.platform,
    status: row.status,
    online: row.status !== 'revoked' && !!row.lastSeenAt && now - row.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    cpu: row.cpu ?? null,
    vram: row.vram ?? null,
    models: row.models ?? [],
    capabilities: row.capabilities ?? ['text:infer'],
    hardware: row.hardware ?? null,
    hermes: row.hermes ?? null,
    policy: readPolicy(row.policy),
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function setNodeStatus(
  userId: string,
  nodeId: string,
  status: 'paused' | 'enrolled' | 'revoked',
): Promise<{ ok: boolean }> {
  if (!['paused', 'enrolled', 'revoked'].includes(status)) return { ok: false }
  return db.transaction(async tx => {
    const [n] = await tx.select().from(node).where(and(eq(node.id, nodeId), eq(node.userId, userId))).for('update').limit(1)
    if (!n || n.status === 'revoked') return { ok: false }
    await tx.update(node).set({ status }).where(and(eq(node.id, nodeId), eq(node.userId, userId)))
    if (status === 'revoked') await tx.update(nodeIdentity).set({ revoked: true }).where(and(eq(nodeIdentity.nodeId, nodeId), eq(nodeIdentity.userId, userId)))
    return { ok: true }
  })
}

// --- Scoped API tokens (MCP / developers) ------------------------------------

export async function createApiToken(
  userId: string,
  name: string,
  scope: 'read_draft' | 'market:invoke' = 'read_draft',
  expiresInDays = 30,
): Promise<{ token: string; id: string }> {
  const token = generateSecret('vsk')
  const id = randomUUID()
  const safeDays = Math.min(365, Math.max(1, Math.trunc(expiresInDays)))
  await db.insert(apiToken).values({ id, userId, name: name.trim().slice(0, 60) || 'API token', tokenHash: hashToken(token), scope, expiresAt: new Date(Date.now() + safeDays * 24 * 60 * 60_000) })
  return { token, id }
}

export async function listApiTokens(userId: string): Promise<ApiTokenView[]> {
  const rows = await db
    .select()
    .from(apiToken)
    .where(and(eq(apiToken.userId, userId), eq(apiToken.revoked, false)))
    .orderBy(desc(apiToken.createdAt))
    .limit(20)
  return rows.map((row) => ({ id: row.id, name: row.name, scope: row.scope, organizationId: row.organizationId, expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null, lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null, createdAt: row.createdAt.toISOString() }))
}

export async function revokeApiToken(userId: string, id: string): Promise<{ ok: boolean }> {
  const updated = await db
    .update(apiToken)
    .set({ revoked: true })
    .where(and(eq(apiToken.id, id), eq(apiToken.userId, userId)))
    .returning({ id: apiToken.id })
  return { ok: updated.length > 0 }
}

export async function resolveApiToken(token: string): Promise<{ userId: string; scope: string } | null> {
  if (!token.startsWith('vsk_')) return null
  const [row] = await db.select().from(apiToken).where(and(eq(apiToken.tokenHash, hashToken(token)), eq(apiToken.revoked, false))).limit(1)
  if (!row || (row.expiresAt && row.expiresAt.getTime() <= Date.now())) return null
  await db.update(apiToken).set({ lastUsedAt: new Date() }).where(and(eq(apiToken.id, row.id), eq(apiToken.userId, row.userId)))
  return { userId: row.userId, scope: row.scope }
}
