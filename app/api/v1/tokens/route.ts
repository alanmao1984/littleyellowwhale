import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { listApiTokens } from '@/lib/venus/nodes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const tokens = await listApiTokens(session.user.id)
  return NextResponse.json({ tokens }, { headers: { 'Cache-Control': 'no-store' } })
}
