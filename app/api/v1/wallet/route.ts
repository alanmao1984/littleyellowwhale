import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getWallet } from '@/lib/venus/ledger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const wallet = await getWallet(session.user.id)
  return NextResponse.json(wallet, { headers: { 'Cache-Control': 'no-store' } })
}
