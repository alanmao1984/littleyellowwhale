'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  createApiToken as createApiTokenFor,
  createEnrollmentIntent as createEnrollmentIntentFor,
  revokeApiToken as revokeApiTokenFor,
  setNodeStatus as setNodeStatusFor,
  saveNodePolicy as saveNodePolicyFor,
} from '@/lib/venus/nodes'

async function getUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function generateEnrollmentCode(input: { platform: string; nodeName: string }) {
  const userId = await getUserId()
  const result = await createEnrollmentIntentFor(userId, input)
  if (result.ok) revalidatePath('/nodes')
  return result
}

export async function setNodeStatus(nodeId: string, status: 'paused' | 'enrolled' | 'revoked') {
  const userId = await getUserId()
  if (typeof nodeId !== 'string' || !nodeId) return { ok: false as const }
  const result = await setNodeStatusFor(userId, nodeId, status)
  if (result.ok) revalidatePath('/nodes')
  return result
}

export async function saveNodePolicy(nodeId: string, input: unknown) {
  const userId = await getUserId()
  if (typeof nodeId !== 'string' || !nodeId) return { ok: false as const }
  const result = await saveNodePolicyFor(userId, nodeId, input)
  if (result.ok) revalidatePath('/nodes')
  return result
}

export async function createApiToken(name: string, scope: 'read_draft' | 'market:invoke' = 'read_draft', expiresInDays = 30) {
  const userId = await getUserId()
  const result = await createApiTokenFor(userId, typeof name === 'string' ? name : 'API token', scope, expiresInDays)
  revalidatePath('/developers')
  revalidatePath('/text-market')
  return result
}

export async function revokeApiToken(id: string) {
  const userId = await getUserId()
  if (typeof id !== 'string' || !id) return { ok: false as const }
  const result = await revokeApiTokenFor(userId, id)
  if (result.ok) revalidatePath('/developers')
  return result
}
