import { after } from 'next/server'
import { claimSchema } from '@/packages/node-protocol'
import { claimWork, claimWorkBatch, reconcileUserLeases } from '@/lib/venus/execution'
import { recoverLeaseWatchers } from '@/lib/venus/lease-watchers'
import { authenticateNode, nodeResponse, readLimitedJson } from '@/lib/venus/node-http'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const principal = await authenticateNode(request)
  if (!principal) return nodeResponse({ error: 'unauthorized' }, 401)
  const body = await readLimitedJson(request, 2048).catch(() => null)
  const parsed = claimSchema.safeParse(body)
  if (!parsed.success) return nodeResponse({ error: 'invalid_request' }, 400)
  await reconcileUserLeases(principal.userId)
  const batchRequested = !!body && typeof body === 'object' && 'limit' in body
  const result = batchRequested
    ? await claimWorkBatch(principal, parsed.data.requestId, parsed.data.limit)
    : await claimWork(principal, parsed.data.requestId)
  after(() => recoverLeaseWatchers(principal.userId))
  return nodeResponse(result)
}
