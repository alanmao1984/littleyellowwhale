import { getSessionUser } from '@/lib/venus/session'
import { readLimitedJson } from '@/lib/venus/node-http'
import { validateSkillPackage } from '@/lib/venus/skill-package'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  const input = await readLimitedJson(request, 128 * 1024).catch(() => null)
  const result = validateSkillPackage(input)
  return Response.json(result, { status: result.ok ? 200 : 400, headers: { 'Cache-Control': 'no-store' } })
}
