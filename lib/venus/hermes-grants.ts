import { randomUUID } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { hermesAccessGrant, node } from '@/lib/db/schema'
import { generateSecret, hashToken } from './tokens'

const GRANT_TTL_MS = 10 * 60_000
export async function createHermesGrant(userId: string, nodeId: string) {
  const [owned] = await db.select({ id: node.id }).from(node).where(and(eq(node.id, nodeId), eq(node.userId, userId))).limit(1)
  if (!owned) return null
  const code = generateSecret('hg')
  const expiresAt = new Date(Date.now() + GRANT_TTL_MS)
  await db.insert(hermesAccessGrant).values({ id: randomUUID(), nodeId, userId, codeHash: hashToken(code), expiresAt })
  return { code, expiresAt: expiresAt.toISOString() }
}

export async function consumeHermesGrant(code: string) {
  return db.transaction(async tx => {
    const [grant] = await tx.select().from(hermesAccessGrant).where(and(eq(hermesAccessGrant.codeHash, hashToken(code)), isNull(hermesAccessGrant.consumedAt), gt(hermesAccessGrant.expiresAt, new Date()))).for('update').limit(1)
    if (!grant) return null
    await tx.update(hermesAccessGrant).set({ consumedAt: new Date() }).where(and(eq(hermesAccessGrant.id, grant.id), isNull(hermesAccessGrant.consumedAt)))
    return { nodeId: grant.nodeId }
  })
}
