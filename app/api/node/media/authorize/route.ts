import { z } from 'zod'
import { authenticateNode, nodeResponse, readLimitedJson } from '@/lib/venus/node-http'
import { issueNodeTransfer } from '@/lib/venus/private-media'

export const runtime = 'nodejs'
const schema = z.object({ attemptId: z.string().uuid(), fence: z.number().int().positive(), assetId: z.string().uuid(), action: z.enum(['download', 'upload']) }).strict()
export async function POST(request: Request) {
  const principal = await authenticateNode(request)
  if (!principal) return nodeResponse({ error: 'unauthorized' }, 401)
  const parsed = schema.safeParse(await readLimitedJson(request, 4096).catch(() => null))
  if (!parsed.success) return nodeResponse({ error: 'invalid_request' }, 400)
  const transfer = await issueNodeTransfer(principal.nodeId, parsed.data.attemptId, parsed.data.fence, parsed.data.assetId, parsed.data.action)
  return transfer ? nodeResponse(transfer) : nodeResponse({ error: 'forbidden' }, 403)
}
