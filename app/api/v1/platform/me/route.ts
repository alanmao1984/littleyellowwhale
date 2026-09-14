import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getPlatformRole } from '@/lib/venus/platform-authorization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lightweight check a signed-in client uses to decide whether to render the
// operator control area. This is a UX hint only — every write API re-checks the
// platform role server-side, so a forged response here grants nothing.
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const role = await getPlatformRole(session.user.id)
  return Response.json({ platformAdmin: role === 'platform_admin', role }, { headers: { 'Cache-Control': 'no-store' } })
}
