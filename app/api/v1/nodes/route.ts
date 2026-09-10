import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { listEnrollmentIntents, listNodes } from '@/lib/venus/nodes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const [nodes, enrollments] = await Promise.all([listNodes(session.user.id), listEnrollmentIntents(session.user.id)])
  return NextResponse.json({ nodes, enrollments }, { headers: { 'Cache-Control': 'no-store' } })
}
