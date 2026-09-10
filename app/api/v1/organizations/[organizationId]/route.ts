import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createOrganizationStructure, getOrganizationWorkspace } from '@/lib/venus/organizations'

export const runtime = 'nodejs'
async function userId() { return (await auth.api.getSession({ headers: await headers() }))?.user.id ?? null }
export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) { const id = await userId(); if (!id) return Response.json({ error: 'unauthorized' }, { status: 401 }); const data = await getOrganizationWorkspace(id, (await params).organizationId); return data ? Response.json(data, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'not_found' }, { status: 404 }) }
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) { const id = await userId(); if (!id) return Response.json({ error: 'unauthorized' }, { status: 401 }); const result = await createOrganizationStructure(id, (await params).organizationId, await request.json().catch(() => null)); return Response.json(result, { status: result.ok ? 201 : result.error === 'forbidden' ? 403 : 400 }) }
