import { sleep } from 'workflow'
import { inspectLease } from '@/lib/venus/execution'

async function checkLease(userId: string, attemptId: string) {
  'use step'
  return inspectLease(userId, attemptId)
}

export async function watchLease(userId: string, attemptId: string) {
  'use workflow'
  for (;;) {
    const expiresAt = await checkLease(userId, attemptId)
    if (!expiresAt) return
    await sleep(new Date(expiresAt))
  }
}
