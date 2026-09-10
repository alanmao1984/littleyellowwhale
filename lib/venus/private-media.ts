import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { get, put } from '@vercel/blob'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ledgerEntry, mediaAsset, node, nodeHeartbeat, task, taskItem, transferToken, wallet } from '@/lib/db/schema'
import { generateSecret, hashToken } from './tokens'
import { ensureWallet } from './ledger'
import { addStr, gte, subStr } from './money'
import { requireOrganizationAction } from './organizations'

export const MAX_PRIVATE_MEDIA_BYTES = 250 * 1024 * 1024
export const PRIVATE_MEDIA_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const
const extensionByType: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }

export function safeMediaUpload(userId: string, pathname: string, payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const value = payload as Record<string, unknown>
  const assetId = typeof value.assetId === 'string' && /^[0-9a-f-]{36}$/i.test(value.assetId) ? value.assetId : null
  const contentType = typeof value.contentType === 'string' && PRIVATE_MEDIA_TYPES.includes(value.contentType as typeof PRIVATE_MEDIA_TYPES[number]) ? value.contentType : null
  const byteSize = typeof value.byteSize === 'number' && Number.isInteger(value.byteSize) && value.byteSize > 0 && value.byteSize <= MAX_PRIVATE_MEDIA_BYTES ? value.byteSize : null
  const sha256 = typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256) ? value.sha256 : null
  if (!assetId || !contentType || !byteSize || !sha256) return null
  const expected = `venus/${userId}/${assetId}/input.${extensionByType[contentType]}`
  return pathname === expected ? { assetId, userId, contentType, byteSize, sha256, pathname } : null
}

async function digestBlob(pathname: string) {
  const result = await get(pathname, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) throw new Error('blob_missing')
  const hash = createHash('sha256'); let size = 0
  const reader = result.stream.getReader()
  try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > MAX_PRIVATE_MEDIA_BYTES) throw new Error('blob_too_large'); hash.update(chunk.value) } }
  finally { reader.releaseLock() }
  return { sha256: hash.digest('hex'), size, contentType: result.blob.contentType }
}

export async function registerCompletedUpload(payload: { assetId: string; userId: string; pathname: string; contentType: string; byteSize: number; sha256: string }) {
  const verified = await digestBlob(payload.pathname)
  if (verified.sha256 !== payload.sha256 || verified.size !== payload.byteSize || verified.contentType !== payload.contentType) throw new Error('blob_integrity_mismatch')
  await db.insert(mediaAsset).values({ id: payload.assetId, userId: payload.userId, kind: 'input', pathname: payload.pathname, contentType: payload.contentType, byteSize: payload.byteSize, sha256: payload.sha256, retentionUntil: new Date(Date.now() + 7 * 24 * 60 * 60_000) }).onConflictDoNothing({ target: mediaAsset.pathname })
}

export async function findAuthorizedAsset(userId: string, assetId: string) {
  const [asset] = await db.select().from(mediaAsset).where(and(eq(mediaAsset.id, assetId), eq(mediaAsset.userId, userId), eq(mediaAsset.status, 'ready'), isNull(mediaAsset.deletedAt))).limit(1)
  return asset ?? null
}

export async function issueNodeTransfer(nodeId: string, attemptId: string, fence: number, assetId: string, action: 'download' | 'upload') {
  return db.transaction(async tx => {
    const [item] = await tx.select().from(taskItem).where(and(eq(taskItem.attemptId, attemptId), eq(taskItem.nodeId, nodeId), eq(taskItem.fence, fence), eq(taskItem.status, 'running'))).for('update').limit(1)
    if (!item) return null
    const [tk] = await tx.select().from(task).where(and(eq(task.id, item.taskId), eq(task.userId, item.userId))).limit(1)
    if (!tk || tk.nodeId !== nodeId) return null
    const [asset] = await tx.select().from(mediaAsset).where(and(eq(mediaAsset.id, assetId), eq(mediaAsset.userId, tk.userId), eq(mediaAsset.status, 'ready'), isNull(mediaAsset.deletedAt))).limit(1)
    if (action === 'download' && !asset) return null
    const token = generateSecret('vmt')
    const id = randomUUID(); const expiresAt = new Date(Date.now() + 5 * 60_000)
    await tx.insert(transferToken).values({ id, tokenHash: hashToken(token), userId: tk.userId, nodeId, assetId, taskId: tk.id, attemptId, fence, action, maxBytes: action === 'download' ? asset!.byteSize : MAX_PRIVATE_MEDIA_BYTES, expiresAt })
    return { token, expiresAt: expiresAt.toISOString(), maxBytes: action === 'download' ? asset!.byteSize : MAX_PRIVATE_MEDIA_BYTES }
  })
}

export async function consumeTransfer(token: string, action: 'download' | 'upload') {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(transferToken).where(and(eq(transferToken.tokenHash, hashToken(token)), eq(transferToken.action, action), isNull(transferToken.usedAt))).for('update').limit(1)
    if (!row || row.expiresAt.getTime() <= Date.now()) return null
    const [item] = await tx.select().from(taskItem).where(and(eq(taskItem.attemptId, row.attemptId), eq(taskItem.nodeId, row.nodeId), eq(taskItem.fence, row.fence), eq(taskItem.status, 'running'))).limit(1)
    if (!item) return null
    await tx.update(transferToken).set({ usedAt: new Date() }).where(eq(transferToken.id, row.id))
    return row
  })
}

export async function storeNodeOutput(transfer: typeof transferToken.$inferSelect, body: ReadableStream<Uint8Array>, contentType: string, sha256: string, byteSize: number) {
  if (!PRIVATE_MEDIA_TYPES.includes(contentType as typeof PRIVATE_MEDIA_TYPES[number]) || byteSize <= 0 || byteSize > transfer.maxBytes || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('invalid_media')
  const pathname = `venus/${transfer.userId}/${transfer.assetId}/output-${transfer.attemptId}.${extensionByType[contentType]}`
  const blob = await put(pathname, body, { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: false, multipart: false })
  const verified = await digestBlob(blob.pathname)
  if (verified.sha256 !== sha256 || verified.size !== byteSize) throw new Error('integrity_mismatch')
  const assetId = randomUUID()
  await db.insert(mediaAsset).values({ id: assetId, userId: transfer.userId, taskId: transfer.taskId, taskItemId: null, nodeId: transfer.nodeId, kind: 'output', pathname: blob.pathname, contentType, byteSize, sha256, status: 'ready', attemptId: transfer.attemptId, fence: transfer.fence, retentionUntil: new Date(Date.now() + 7 * 24 * 60 * 60_000) })
  return { assetId }
}

export const videoTemplateSchema = z.enum(['compress_mp4', 'resize_720p', 'resize_1080p'])
const videoTaskSchema = z.object({ assetId: z.string().uuid(), nodeId: z.string().uuid(), template: videoTemplateSchema, requestId: z.string().uuid(), organizationId: z.string().uuid().nullable().default(null) }).strict()
const templatePrice = { compress_mp4: '4.0000', resize_720p: '5.0000', resize_1080p: '6.0000' } as const

export async function submitPrivateVideoTask(userId: string, input: unknown) {
  const parsed = videoTaskSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'invalid_input' as const }
  const [asset, organizationAccess] = await Promise.all([
    findAuthorizedAsset(userId, parsed.data.assetId),
    parsed.data.organizationId ? requireOrganizationAction(userId, parsed.data.organizationId, 'submit_task') : Promise.resolve(true),
  ])
  if (!organizationAccess) return { ok: false as const, error: 'forbidden' as const }
  if (!asset || !PRIVATE_MEDIA_TYPES.includes(asset.contentType as typeof PRIVATE_MEDIA_TYPES[number])) return { ok: false as const, error: 'invalid_asset' as const }
  await ensureWallet(userId)
  return db.transaction(async tx => {
    const [selected] = await tx.select({ id: node.id, name: node.name, ownerId: node.userId, organizationId: node.organizationId, models: nodeHeartbeat.models, capabilities: nodeHeartbeat.capabilities }).from(node).innerJoin(nodeHeartbeat, eq(nodeHeartbeat.nodeId, node.id)).where(eq(node.id, parsed.data.nodeId)).for('update').limit(1)
    const selfNode = selected?.ownerId === userId && !parsed.data.organizationId
    const organizationNode = !!parsed.data.organizationId && selected?.organizationId === parsed.data.organizationId
    if (!selected || (!selfNode && !organizationNode) || !selected.capabilities.includes('video:transcode')) return { ok: false as const, error: 'invalid_node' as const }
    const requestKey = `${userId}:video:${parsed.data.requestId}`
    const [existing] = await tx.select().from(task).where(and(eq(task.userId, userId), eq(task.requestKey, requestKey))).limit(1)
    if (existing) return { ok: true as const, taskId: existing.id, reserved: existing.reservedAmount }
    const price = templatePrice[parsed.data.template]
    const [w] = await tx.select().from(wallet).where(eq(wallet.userId, userId)).for('update').limit(1)
    if (!w || !gte(w.spendingAvailable, price)) return { ok: false as const, error: 'insufficient_budget' as const }
    const available = subStr(w.spendingAvailable, price); const reserved = addStr(w.spendingReserved, price)
    const taskId = randomUUID()
    await tx.update(wallet).set({ spendingAvailable: available, spendingReserved: reserved, updatedAt: new Date() }).where(eq(wallet.userId, userId))
    await tx.insert(task).values({ id: taskId, userId, instruction: `固定视频模板：${parsed.data.template}`, taskType: 'video', operation: 'transcode', mediaSpec: { taskType: 'video', operation: 'transcode' }, itemCount: 1, concurrency: 1, unitPrice: price, reservedAmount: price, status: 'queued', nodeId: selected.id, nodeName: selected.name, model: 'ffmpeg', consentedAt: new Date(), requestKey, requestHash: createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex'), organizationId: parsed.data.organizationId, dispatchDomain: parsed.data.organizationId ? 'organization' : 'self' })
    await tx.insert(taskItem).values({ id: randomUUID(), taskId, userId, idx: 0, text: JSON.stringify({ kind: 'remote_private_media', assetId: asset.id, template: parsed.data.template, contentType: asset.contentType, sha256: asset.sha256, byteSize: asset.byteSize }), billingUnits: 1 })
    await tx.update(mediaAsset).set({ taskId }).where(and(eq(mediaAsset.id, asset.id), eq(mediaAsset.userId, userId)))
    await tx.insert(ledgerEntry).values([
      { id: randomUUID(), userId, kind: 'reserve', account: 'spending_available', amount: `-${price}`, balanceAfter: available, taskId, businessKey: `video-reserve-out:${taskId}`, description: '私有视频处理预算预留' },
      { id: randomUUID(), userId, kind: 'reserve', account: 'spending_reserved', amount: price, balanceAfter: reserved, taskId, businessKey: `video-reserve-in:${taskId}`, description: '私有视频处理预算预留' },
    ])
    return { ok: true as const, taskId, reserved: price }
  })
}

export async function listMediaAssets(userId: string) {
  const rows = await db.select({ id: mediaAsset.id, kind: mediaAsset.kind, taskId: mediaAsset.taskId, contentType: mediaAsset.contentType, byteSize: mediaAsset.byteSize, sha256: mediaAsset.sha256, status: mediaAsset.status, createdAt: mediaAsset.createdAt }).from(mediaAsset).where(and(eq(mediaAsset.userId, userId), isNull(mediaAsset.deletedAt))).orderBy(desc(mediaAsset.createdAt)).limit(100)
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), url: `/api/media/assets/${row.id}` }))
}
