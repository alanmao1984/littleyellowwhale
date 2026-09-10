import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { inviteOrganizationMember } from '@/lib/venus/organizations'

export const runtime = 'nodejs'
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const result = await inviteOrganizationMember(session.user.id, (await params).organizationId, await request.json().catch(() => null))
  return Response.json(result, { status: result.ok ? 201 : result.error === 'forbidden' ? 403 : result.error === 'delivery_failed' || result.error === 'delivery_unavailable' ? 503 : 400 })
}
