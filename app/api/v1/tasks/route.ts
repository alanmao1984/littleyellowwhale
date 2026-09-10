import { after, NextResponse } from 'next/server'
import { reconcileUserLeases } from '@/lib/venus/execution'
import { recoverLeaseWatchers } from '@/lib/venus/lease-watchers'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { listTasks } from '@/lib/venus/ledger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await reconcileUserLeases(session.user.id)
  after(() => recoverLeaseWatchers(session.user.id))
  const tasks = await listTasks(session.user.id)
  return NextResponse.json({ tasks }, { headers: { 'Cache-Control': 'no-store' } })
}
