import { after } from 'next/server'
import { claimSchema } from '@/packages/node-protocol'
import { claimWork, reconcileUserLeases } from '@/lib/venus/execution'
import { recoverLeaseWatchers } from '@/lib/venus/lease-watchers'
import { authenticateNode, nodeResponse, readLimitedJson } from '@/lib/venus/node-http'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const principal = await authenticateNode(request)
  if (!principal) return nodeResponse({ error: 'unauthorized' }, 401)
  const parsed = claimSchema.safeParse(await readLimitedJson(request, 2048).catch(() => null))
  if (!parsed.success) return nodeResponse({ error: 'invalid_request' }, 400)
  await reconcileUserLeases(principal.userId)
  const result = await claimWork(principal, parsed.data.requestId)
  after(() => recoverLeaseWatchers(principal.userId))
  return nodeResponse(result)
}
