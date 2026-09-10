import { createHash, randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiRequest, apiToken, ledgerEntry, marketOffering, node, nodeHeartbeat, task, taskItem, usageRecord, wallet } from '@/lib/db/schema'
import { ensureWallet } from './ledger'
import { addStr, gte, multiplyStr, percentageStr, subStr } from './money'
import { hashToken } from './tokens'
import { cancelExecution } from './execution'

const messageSchema = z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string().min(1).max(30_000) }).strict()
export const chatCompletionSchema = z.object({
  model: z.string().trim().min(1).max(120),
  messages: z.array(messageSchema).min(1).max(64),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().min(1).max(8192).default(1024),
  stream: z.literal(false).default(false),
}).strict()
export type ChatCompletionInput = z.infer<typeof chatCompletionSchema>

export type ApiPrincipal = { tokenId: string; userId: string; scope: string; organizationId: string | null }
export async function resolveMarketPrincipal(request: Request): Promise<ApiPrincipal | null> {
  const value = request.headers.get('authorization')
  if (!value?.startsWith('Bearer ')) return null
  const plain = value.slice(7).trim()
  if (!plain.startsWith('vsk_')) return null
  const [row] = await db.select().from(apiToken).where(and(eq(apiToken.tokenHash, hashToken(plain)), eq(apiToken.revoked, false), or(isNull(apiToken.expiresAt), gt(apiToken.expiresAt, new Date())))).limit(1)
  if (!row || !row.scope.split(/[ ,]+/).includes('market:invoke')) return null
  await db.update(apiToken).set({ lastUsedAt: new Date() }).where(and(eq(apiToken.id, row.id), eq(apiToken.userId, row.userId)))
  return { tokenId: row.id, userId: row.userId, scope: row.scope, organizationId: row.organizationId }
}

export async function listAvailableModels(principal?: ApiPrincipal) {
  const rows = await db.select({ id: marketOffering.id, alias: marketOffering.modelAlias, contextLimit: marketOffering.contextLimit, inputUnitPrice: marketOffering.inputUnitPrice, outputUnitPrice: marketOffering.outputUnitPrice, organizationId: marketOffering.organizationId, lastHealthyAt: nodeHeartbeat.lastSeenAt })
    .from(marketOffering).innerJoin(nodeHeartbeat, eq(nodeHeartbeat.nodeId, marketOffering.nodeId))
    .where(and(eq(marketOffering.status, 'published'), gt(nodeHeartbeat.lastSeenAt, new Date(Date.now() - 90_000)), principal?.organizationId ? or(isNull(marketOffering.organizationId), eq(marketOffering.organizationId, principal.organizationId)) : isNull(marketOffering.organizationId)))
    .orderBy(asc(marketOffering.modelAlias)).limit(100)
  return rows.map(row => ({ id: row.alias, object: 'model' as const, created: Math.floor(row.lastHealthyAt.getTime() / 1000), owned_by: 'venus-vtest', context_limit: row.contextLimit, pricing: { input_per_1k: row.inputUnitPrice, output_per_1k: row.outputUnitPrice, currency: 'VTEST' } }))
}

export async function listOwnedOfferings(userId: string) {
  return db.select().from(marketOffering).where(eq(marketOffering.userId, userId)).orderBy(desc(marketOffering.createdAt)).limit(100)
}

const offeringSchema = z.object({ nodeId: z.string().uuid(), modelAlias: z.string().trim().min(1).max(120), providerModel: z.string().trim().min(1).max(120), contextLimit: z.number().int().min(512).max(2_000_000), inputUnitPrice: z.string().regex(/^\d{1,8}(?:\.\d{1,4})?$/), outputUnitPrice: z.string().regex(/^\d{1,8}(?:\.\d{1,4})?$/), concurrency: z.number().int().min(1).max(8), organizationId: z.string().uuid().nullable().default(null) }).strict()
export async function publishOffering(userId: string, input: unknown) {
  const parsed = offeringSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'invalid_input' as const }
  return db.transaction(async tx => {
    const [ownedNode] = await tx.select().from(node).where(and(eq(node.id, parsed.data.nodeId), eq(node.userId, userId))).for('update').limit(1)
    const [heartbeat] = await tx.select().from(nodeHeartbeat).where(and(eq(nodeHeartbeat.nodeId, parsed.data.nodeId), eq(nodeHeartbeat.userId, userId))).limit(1)
    if (!ownedNode || ownedNode.status !== 'enrolled' || !heartbeat?.models?.includes(parsed.data.providerModel) || !heartbeat.capabilities.includes('text:infer')) return { ok: false as const, error: 'node_unavailable' as const }
    const [existing] = await tx.select().from(marketOffering).where(and(eq(marketOffering.nodeId, parsed.data.nodeId), eq(marketOffering.modelAlias, parsed.data.modelAlias))).limit(1)
    const values = { ...parsed.data, userId, capabilities: ['text:infer'], status: 'published', lastHealthyAt: heartbeat.lastSeenAt, updatedAt: new Date() }
    if (existing) await tx.update(marketOffering).set(values).where(and(eq(marketOffering.id, existing.id), eq(marketOffering.userId, userId)))
    else await tx.insert(marketOffering).values({ id: randomUUID(), ...values })
    await tx.update(node).set({ dispatchDomain: parsed.data.organizationId ? 'organization' : 'public_vtest', visibility: parsed.data.organizationId ? 'organization' : 'public' }).where(and(eq(node.id, parsed.data.nodeId), eq(node.userId, userId)))
    return { ok: true as const }
  })
}

function estimateTokens(messages: ChatCompletionInput['messages']) {
  return Math.max(1, Math.ceil(messages.reduce((sum, message) => sum + message.content.length, 0) / 4))
}

export async function submitMarketJob(principal: ApiPrincipal, requestId: string, input: unknown) {
  const parsed = chatCompletionSchema.safeParse(input)
  if (!parsed.success || !/^[A-Za-z0-9._:-]{8,120}$/.test(requestId)) return { ok: false as const, status: 400, error: 'invalid_request' as const }
  await ensureWallet(principal.userId)
  return db.transaction(async tx => {
    const [previous] = await tx.select().from(apiRequest).where(and(eq(apiRequest.apiTokenId, principal.tokenId), eq(apiRequest.requestId, requestId))).limit(1)
    if (previous) return { ok: true as const, duplicate: true, jobId: previous.id, taskId: previous.taskId!, status: previous.status, reserved: previous.reservedAmount }
    const [offer] = await tx.select({ offering: marketOffering, nodeName: node.name, heartbeat: nodeHeartbeat.lastSeenAt }).from(marketOffering).innerJoin(node, eq(node.id, marketOffering.nodeId)).innerJoin(nodeHeartbeat, eq(nodeHeartbeat.nodeId, marketOffering.nodeId))
      .where(and(eq(marketOffering.status, 'published'), eq(marketOffering.modelAlias, parsed.data.model), gt(nodeHeartbeat.lastSeenAt, new Date(Date.now() - 90_000)), principal.organizationId ? or(isNull(marketOffering.organizationId), eq(marketOffering.organizationId, principal.organizationId)) : isNull(marketOffering.organizationId))).orderBy(asc(marketOffering.inputUnitPrice), asc(marketOffering.createdAt)).for('update').limit(1)
    if (!offer) return { ok: false as const, status: 404, error: 'model_unavailable' as const }
    const inputTokens = estimateTokens(parsed.data.messages)
    if (inputTokens + parsed.data.max_tokens > offer.offering.contextLimit) return { ok: false as const, status: 400, error: 'context_length_exceeded' as const }
    const quote = addStr(multiplyStr(offer.offering.inputUnitPrice, Math.ceil(inputTokens / 1000)), multiplyStr(offer.offering.outputUnitPrice, Math.ceil(parsed.data.max_tokens / 1000)))
    const [w] = await tx.select().from(wallet).where(eq(wallet.userId, principal.userId)).for('update').limit(1)
    if (!w || !gte(w.spendingAvailable, quote)) return { ok: false as const, status: 402, error: 'insufficient_vtest' as const }
    const available = subStr(w.spendingAvailable, quote)
    const reserved = addStr(w.spendingReserved, quote)
    const taskId = randomUUID(); const jobId = randomUUID(); const itemId = randomUUID()
    const system = parsed.data.messages.filter(message => message.role === 'system').map(message => message.content).join('\n') || '请根据对话提供准确、简洁的回答。'
    const conversation = parsed.data.messages.filter(message => message.role !== 'system').map(message => `${message.role}: ${message.content}`).join('\n')
    const requestHash = createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex')
    await tx.update(wallet).set({ spendingAvailable: available, spendingReserved: reserved, updatedAt: new Date() }).where(eq(wallet.userId, principal.userId))
    await tx.insert(apiRequest).values({ id: jobId, requestId, userId: principal.userId, apiTokenId: principal.tokenId, organizationId: principal.organizationId, offeringId: offer.offering.id, taskId, model: parsed.data.model, status: 'queued', reservedAmount: quote })
    await tx.insert(task).values({ id: taskId, userId: principal.userId, instruction: system, itemCount: 1, concurrency: 1, unitPrice: quote, reservedAmount: quote, status: 'queued', nodeId: offer.offering.nodeId, nodeName: offer.nodeName, model: offer.offering.providerModel, consentedAt: new Date(), requestKey: `${principal.userId}:api:${requestId}`, requestHash, maxOutputTokens: Math.min(parsed.data.max_tokens, 8192), organizationId: principal.organizationId, dispatchDomain: principal.organizationId ? 'organization' : 'public_vtest', offeringId: offer.offering.id, apiRequestId: jobId })
    await tx.insert(taskItem).values({ id: itemId, taskId, userId: principal.userId, idx: 0, text: conversation, billingUnits: 1 })
    await tx.insert(ledgerEntry).values([
      { id: randomUUID(), userId: principal.userId, kind: 'reserve', account: 'spending_available', amount: `-${quote}`, balanceAfter: available, taskId, businessKey: `api-reserve-out:${jobId}`, description: '公网文本 API 最大预算预留' },
      { id: randomUUID(), userId: principal.userId, kind: 'reserve', account: 'spending_reserved', amount: quote, balanceAfter: reserved, taskId, businessKey: `api-reserve-in:${jobId}`, description: '公网文本 API 最大预算预留' },
    ])
    return { ok: true as const, duplicate: false, jobId, taskId, status: 'queued', reserved: quote }
  })
}

export async function getMarketJob(principal: ApiPrincipal, jobId: string) {
  const [job] = await db.select().from(apiRequest).where(and(eq(apiRequest.id, jobId), eq(apiRequest.userId, principal.userId), eq(apiRequest.apiTokenId, principal.tokenId))).limit(1)
  if (!job) return null
  const [item] = job.taskId ? await db.select({ status: taskItem.status, output: taskItem.result, usage: taskItem.usage, errorCode: taskItem.errorCode }).from(taskItem).where(and(eq(taskItem.taskId, job.taskId), eq(taskItem.userId, principal.userId))).limit(1) : []
  return { id: job.id, object: 'venus.job', created: Math.floor(job.createdAt.getTime() / 1000), model: job.model, status: item?.status === 'review' && item.output ? 'completed' : item?.status === 'cancelled' ? 'cancelled' : job.status, task_id: job.taskId, reserved_amount: job.reservedAmount, settled_amount: job.settledAmount, output: item?.output ?? null, usage: item?.usage ?? null, error: item?.errorCode ?? job.errorCode }
}

export async function cancelMarketJob(principal: ApiPrincipal, jobId: string) {
  const [job] = await db.select().from(apiRequest).where(and(eq(apiRequest.id, jobId), eq(apiRequest.userId, principal.userId), eq(apiRequest.apiTokenId, principal.tokenId))).limit(1)
  if (!job?.taskId) return null
  const result = await cancelExecution(principal.userId, job.taskId)
  if (result.ok) await db.update(apiRequest).set({ status: 'cancelled', completedAt: new Date() }).where(and(eq(apiRequest.id, jobId), eq(apiRequest.userId, principal.userId)))
  return result
}

export async function listMarketActivity(userId: string) {
  const rows = await db.select({ id: apiRequest.id, model: apiRequest.model, status: apiRequest.status, reservedAmount: apiRequest.reservedAmount, settledAmount: apiRequest.settledAmount, latencyMs: apiRequest.latencyMs, createdAt: apiRequest.createdAt, inputTokens: usageRecord.inputTokens, outputTokens: usageRecord.outputTokens }).from(apiRequest).leftJoin(usageRecord, eq(usageRecord.apiRequestId, apiRequest.id)).where(eq(apiRequest.userId, userId)).orderBy(desc(apiRequest.createdAt)).limit(50)
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

export async function recordMarketUsage(attemptId: string) {
  const [row] = await db.select({ item: taskItem, request: apiRequest, offering: marketOffering }).from(taskItem).innerJoin(task, eq(task.id, taskItem.taskId)).innerJoin(apiRequest, eq(apiRequest.id, task.apiRequestId)).innerJoin(marketOffering, eq(marketOffering.id, task.offeringId)).where(eq(taskItem.attemptId, attemptId)).limit(1)
  if (!row?.item.usage || !row.item.result) return
  const inputAmount = multiplyStr(row.offering.inputUnitPrice, Math.ceil(row.item.usage.inputTokens / 1000))
  const outputAmount = multiplyStr(row.offering.outputUnitPrice, Math.ceil(row.item.usage.outputTokens / 1000))
  const settled = addStr(inputAmount, outputAmount)
  if (!gte(row.request.reservedAmount, settled)) throw new Error('api_usage_exceeds_reservation')
  await Promise.all([ensureWallet(row.request.userId), ensureWallet(row.offering.userId)])
  await db.transaction(async tx => {
    const [existing] = await tx.select({ id: usageRecord.id }).from(usageRecord).where(eq(usageRecord.apiRequestId, row.request.id)).for('update').limit(1)
    if (existing) return
    const [requester] = await tx.select().from(wallet).where(eq(wallet.userId, row.request.userId)).for('update').limit(1)
    const [provider] = row.offering.userId === row.request.userId ? [requester] : await tx.select().from(wallet).where(eq(wallet.userId, row.offering.userId)).for('update').limit(1)
    if (!requester || !provider || !gte(requester.spendingReserved, row.request.reservedAmount)) throw new Error('api_settlement_reconciliation_required')
    const refund = subStr(row.request.reservedAmount, settled)
    const providerAmount = percentageStr(settled, 85)
    const brokerAmount = percentageStr(settled, 5)
    const platformAmount = subStr(subStr(settled, providerAmount), brokerAmount)
    const spendingReserved = subStr(requester.spendingReserved, row.request.reservedAmount)
    const spendingAvailable = addStr(requester.spendingAvailable, refund)
    const earningAvailable = addStr(provider.earningAvailable, providerAmount)
    await tx.update(wallet).set({ spendingReserved, spendingAvailable, ...(row.offering.userId === row.request.userId ? { earningAvailable } : {}), updatedAt: new Date() }).where(eq(wallet.userId, row.request.userId))
    if (row.offering.userId !== row.request.userId) await tx.update(wallet).set({ earningAvailable, updatedAt: new Date() }).where(eq(wallet.userId, row.offering.userId))
    await tx.insert(usageRecord).values({ id: randomUUID(), apiRequestId: row.request.id, userId: row.request.userId, providerUserId: row.offering.userId, organizationId: row.request.organizationId, offeringId: row.offering.id, taskId: row.item.taskId, inputTokens: row.item.usage!.inputTokens, outputTokens: row.item.usage!.outputTokens, inputAmount, outputAmount })
    await tx.insert(ledgerEntry).values([
      { id: randomUUID(), userId: row.request.userId, taskId: row.item.taskId, kind: 'api_settlement', account: 'spending_reserved', amount: `-${row.request.reservedAmount}`, balanceAfter: spendingReserved, businessKey: `api-settle-out:${row.request.id}`, description: '公网 API 真实用量结算' },
      { id: randomUUID(), userId: row.request.userId, taskId: row.item.taskId, kind: 'api_refund', account: 'spending_available', amount: refund, balanceAfter: spendingAvailable, businessKey: `api-refund:${row.request.id}`, description: '公网 API 未使用最大预算释放' },
      { id: randomUUID(), userId: row.offering.userId, taskId: row.item.taskId, kind: 'api_earning', account: 'earning_available', amount: providerAmount, balanceAfter: earningAvailable, businessKey: `api-provider:${row.request.id}`, description: '公网 API 供给方 85% VTEST 测试收益' },
      { id: randomUUID(), userId: row.request.userId, taskId: row.item.taskId, kind: 'api_split', account: 'broker_unallocated', amount: brokerAmount, balanceAfter: brokerAmount, businessKey: `api-broker:${row.request.id}`, description: '公网 API 经纪 5% · 未分配' },
      { id: randomUUID(), userId: row.request.userId, taskId: row.item.taskId, kind: 'api_split', account: 'platform_revenue', amount: platformAmount, balanceAfter: platformAmount, businessKey: `api-platform:${row.request.id}`, description: '公网 API 平台测试份额' },
    ])
    await tx.update(taskItem).set({ reviewDecision: 'accepted', reviewedBy: `api:${row.request.apiTokenId}`, reviewedAt: new Date(), reviewReason: '节点 usage 已通过协议上限校验并由 API 测试规则自动结算' }).where(and(eq(taskItem.id, row.item.id), eq(taskItem.userId, row.request.userId)))
    await tx.update(task).set({ settlementStatus: 'settled', settledAt: new Date(), reservedAmount: '0.0000' }).where(and(eq(task.id, row.item.taskId), eq(task.userId, row.request.userId)))
    await tx.update(apiRequest).set({ status: 'completed', settledAmount: settled, latencyMs: Date.now() - row.request.createdAt.getTime(), completedAt: new Date() }).where(and(eq(apiRequest.id, row.request.id), eq(apiRequest.userId, row.request.userId)))
  })
}
