import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { createOrganization, listOrganizations } from '@/lib/venus/organizations'

export const runtime = 'nodejs'
async function userId() { return (await auth.api.getSession({ headers: await headers() }))?.user.id ?? null }
export async function GET() { const id = await userId(); return id ? Response.json({ organizations: await listOrganizations(id) }, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'unauthorized' }, { status: 401 }) }
export async function POST(request: Request) { const id = await userId(); if (!id) return Response.json({ error: 'unauthorized' }, { status: 401 }); const result = await createOrganization(id, await request.json().catch(() => null)); return Response.json(result, { status: result.ok ? 201 : 400 }) }
