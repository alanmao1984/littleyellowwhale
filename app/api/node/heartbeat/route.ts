import { after } from 'next/server'
import { heartbeatSchema } from '@/packages/node-protocol'
import { recordHeartbeat } from '@/lib/venus/nodes'
import { recoverLeaseWatchers } from '@/lib/venus/lease-watchers'
import { authenticateNode, nodeResponse, readLimitedJson } from '@/lib/venus/node-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Nodes report liveness and real telemetry over outbound HTTPS. The bearer
// token identifies the node; it can only ever update its own heartbeat.
export async function POST(request: Request) {
  const identity = await authenticateNode(request)
  if (!identity) return nodeResponse({ error: 'unauthorized' }, 401)
  const parsed = heartbeatSchema.safeParse(await readLimitedJson(request, 10000).catch(() => null))
  if (!parsed.success) return nodeResponse({ error: 'invalid_request' }, 400)
  const result = await recordHeartbeat(identity.nodeId, identity.userId, parsed.data)
  if (result.status === 'revoked') return nodeResponse({ error: 'unauthorized' }, 401)
  after(() => recoverLeaseWatchers(identity.userId))
  return nodeResponse({ ok: true, protocolVersion: 1, ...result })
}
