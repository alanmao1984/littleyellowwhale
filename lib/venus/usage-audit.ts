import { createHash, verify } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import type { ResultInput } from '@/packages/node-protocol'
import { usageEventPayload } from '@/packages/node-protocol'
import { nodeUsageEvent } from '@/lib/db/schema'

type Tx = Parameters<Parameters<typeof import('@/lib/db').db.transaction>[0]>[0]
export function hashText(value: string) { return createHash('sha256').update(value).digest('hex') }

export async function auditUsage(tx: Tx, value: { input: ResultInput; nodeId: string; userId: string; taskId: string; expectedInput: string; publicKey: string | null }) {
  const receipt = value.input.usageReceipt
  let verified = false
  let reason = 'missing_receipt'
  let eventHash = receipt?.eventHash ?? hashText(`missing:${value.input.attemptId}`)
  let inputHash = receipt?.inputHash ?? hashText(value.expectedInput)
  let outputHash = receipt?.outputHash ?? null
  if (receipt && value.publicKey && value.input.usage) {
    const expectedInputHash = hashText(value.expectedInput)
    const expectedOutputHash = value.input.output === undefined ? null : hashText(value.input.output)
    const payload = usageEventPayload({ attemptId: value.input.attemptId, fence: value.input.fence, model: value.input.model, inputHash: receipt.inputHash, outputHash: receipt.outputHash, usage: value.input.usage ?? null })
    const expectedEventHash = hashText(payload)
    if (receipt.inputHash !== expectedInputHash) reason = 'input_hash_mismatch'
    else if (receipt.outputHash !== expectedOutputHash) reason = 'output_hash_mismatch'
    else if (receipt.eventHash !== expectedEventHash) reason = 'event_hash_mismatch'
    else {
      try { verified = verify(null, Buffer.from(receipt.eventHash, 'hex'), value.publicKey, Buffer.from(receipt.signature, 'base64')); reason = verified ? 'verified' : 'invalid_signature' }
      catch { reason = 'invalid_public_key' }
    }
  } else if (!value.input.usage) reason = 'missing_usage'
  else if (!value.publicKey) reason = 'missing_attestation_key'
  await tx.insert(nodeUsageEvent).values({ id: randomUUID(), attemptId: value.input.attemptId, nodeId: value.nodeId, userId: value.userId, taskId: value.taskId, eventHash, inputHash, outputHash, usage: value.input.usage ?? null, signature: receipt?.signature ?? null, verified, reason })
    .onConflictDoNothing({ target: nodeUsageEvent.attemptId })
  return { verified, eventHash, reason }
}
