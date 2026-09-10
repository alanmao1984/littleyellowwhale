import { resultSchema } from '@/packages/node-protocol'
import { completeAttempt } from '@/lib/venus/execution'
import { authenticateNode, nodeResponse, readLimitedJson } from '@/lib/venus/node-http'
import { recordMarketUsage } from '@/lib/venus/market'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const principal = await authenticateNode(request)
  if (!principal) return nodeResponse({ error: 'unauthorized' }, 401)
  const parsed = resultSchema.safeParse(await readLimitedJson(request).catch(() => null))
  if (!parsed.success) return nodeResponse({ error: 'invalid_request' }, 400)
  const result = await completeAttempt(principal, parsed.data)
  if (result.ok && parsed.data.outcome === 'completed') await recordMarketUsage(parsed.data.attemptId)
  return nodeResponse(result, result.ok ? 200 : 409)
}
