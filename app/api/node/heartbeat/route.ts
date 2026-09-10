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
  const input = await readLimitedJson(request, 10000).catch(() => null)
  const parsed = heartbeatSchema.safeParse(input)
  if (!parsed.success) return nodeResponse({ error: 'invalid_request' }, 400)
  const result = await recordHeartbeat(identity.nodeId, identity.userId, parsed.data)
  if (result.status === 'revoked') return nodeResponse({ error: 'unauthorized' }, 401)
  after(() => recoverLeaseWatchers(identity.userId))
  const { allowedCapabilities: _capabilities, ...legacyPolicy } = result.policy
  const declaredCapabilities = input && typeof input === 'object' && 'capabilities' in input
  return nodeResponse({ ok: true, protocolVersion: declaredCapabilities ? 2 : 1, transports: declaredCapabilities ? ['inline-text', 'private-blob-v1'] : ['inline-text'], ...result, policy: declaredCapabilities ? result.policy : legacyPolicy })
}
