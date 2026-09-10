import { sleep } from 'workflow'
import { releaseSettlement } from '@/lib/venus/settlements'

async function checkRelease(userId: string, settlementId: string) {
  'use step'
  return releaseSettlement(userId, settlementId)
}

export async function watchSettlementRelease(userId: string, settlementId: string) {
  'use workflow'
  for (;;) {
    const result = await checkRelease(userId, settlementId)
    if (!result.releaseAt) return
    await sleep(new Date(result.releaseAt))
  }
}
