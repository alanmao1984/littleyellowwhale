import { leaseSchema } from '@/packages/node-protocol'
import { renewLease } from '@/lib/venus/execution'
import { authenticateNode, nodeResponse, readLimitedJson } from '@/lib/venus/node-http'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const principal = await authenticateNode(request)
  if (!principal) return nodeResponse({ error: 'unauthorized' }, 401)
  const parsed = leaseSchema.safeParse(await readLimitedJson(request, 2048).catch(() => null))
  if (!parsed.success) return nodeResponse({ error: 'invalid_request' }, 400)
  const result = await renewLease(principal, parsed.data.attemptId, parsed.data.fence)
  return nodeResponse(result, result.ok ? 200 : 409)
}
