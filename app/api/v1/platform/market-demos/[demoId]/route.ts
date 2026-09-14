import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { publishDemoEvent, updateDemoEvent, withdrawDemoEvent, type DemoMutationResult } from '@/lib/venus/market-activity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function sessionUserId() {
  return (await auth.api.getSession({ headers: await headers() }))?.user.id ?? null
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update'), data: z.unknown() }),
  z.object({ action: z.literal('publish') }),
  z.object({ action: z.literal('withdraw') }),
])

function httpStatus(result: Extract<DemoMutationResult, { ok: false }>, hasSession: boolean) {
  if (result.error === 'forbidden') return hasSession ? 403 : 401
  if (result.error === 'not_found') return 404
  if (result.error === 'invalid_transition') return 409
  return 400
}

export async function PATCH(request: Request, ctx: { params: Promise<{ demoId: string }> }) {
  const id = await sessionUserId()
  const { demoId } = await ctx.params
  const requestId = request.headers.get('x-request-id') ?? undefined
  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid_input' }, { status: 400 })

  const result =
    parsed.data.action === 'update'
      ? await updateDemoEvent(id, demoId, parsed.data.data, requestId)
      : parsed.data.action === 'publish'
        ? await publishDemoEvent(id, demoId, requestId)
        : await withdrawDemoEvent(id, demoId, requestId)

  if (result.ok) return Response.json(result)
  return Response.json({ error: result.error }, { status: httpStatus(result, !!id) })
}
