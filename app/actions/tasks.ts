'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { cancelTask as cancelTaskFor, createTask as createTaskFor, settleTask as settleTaskFor } from '@/lib/venus/ledger'
import type { TaskSubmission } from '@/lib/venus/task-submission'

async function getUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function submitTask(input: TaskSubmission) {
  const userId = await getUserId()
  const result = await createTaskFor(userId, input)
  if (result.ok) {
    revalidatePath('/tasks')
    revalidatePath('/earnings')
    revalidatePath('/')
  }
  return result
}

export async function cancelTask(taskId: string) {
  const userId = await getUserId()
  if (typeof taskId !== 'string' || taskId.length === 0) return { ok: false as const, error: 'not_found' as const }
  const result = await cancelTaskFor(userId, taskId)
  if (result.ok) {
    revalidatePath('/tasks')
    revalidatePath('/earnings')
    revalidatePath('/')
  }
  return result
}

export async function settleTask(taskId: string) {
  const userId = await getUserId()
  if (typeof taskId !== 'string' || taskId.length === 0) return { ok: false as const, error: 'not_found' as const }
  const result = await settleTaskFor(userId, taskId)
  if (result.ok) {
    revalidatePath('/tasks')
    revalidatePath('/earnings')
    revalidatePath('/')
  }
  return result
}
