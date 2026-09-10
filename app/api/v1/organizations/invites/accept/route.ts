import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { acceptOrganizationInvite } from '@/lib/venus/organizations'

export const runtime = 'nodejs'
const schema = z.object({ token: z.string().min(20).max(200) }).strict()
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid_request' }, { status: 400 })
  const result = await acceptOrganizationInvite(session.user.id, session.user.email, parsed.data.token)
  return Response.json(result, { status: result.ok ? 200 : 400 })
}
