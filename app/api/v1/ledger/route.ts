import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { listLedger } from '@/lib/venus/ledger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const entries = await listLedger(session.user.id)
  return NextResponse.json({ entries }, { headers: { 'Cache-Control': 'no-store' } })
}
