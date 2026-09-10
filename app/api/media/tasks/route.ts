import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { listMediaAssets, submitPrivateVideoTask } from '@/lib/venus/private-media'

export const runtime = 'nodejs'
async function userId() { return (await auth.api.getSession({ headers: await headers() }))?.user.id ?? null }
export async function GET() { const id = await userId(); return id ? Response.json({ assets: await listMediaAssets(id) }, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'unauthorized' }, { status: 401 }) }
export async function POST(request: Request) { const id = await userId(); if (!id) return Response.json({ error: 'unauthorized' }, { status: 401 }); const result = await submitPrivateVideoTask(id, await request.json().catch(() => null)); return Response.json(result, { status: result.ok ? 201 : result.error === 'insufficient_budget' ? 402 : result.error === 'invalid_node' ? 409 : 400 }) }
