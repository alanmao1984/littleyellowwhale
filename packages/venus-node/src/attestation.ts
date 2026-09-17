import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { usageEventPayload, type ResultInput } from '../../node-protocol/index.ts'

export function createAttestationIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    signResult(value: { attemptId: string; fence: number; model: string; input: string; output?: string; usage?: ResultInput['usage'] }) {
      const hash = (text: string) => createHash('sha256').update(text).digest('hex')
      const inputHash = hash(value.input)
      const outputHash = value.output === undefined ? null : hash(value.output)
      const payload = usageEventPayload({ attemptId: value.attemptId, fence: value.fence, model: value.model, inputHash, outputHash, usage: value.usage ?? null })
      const eventHash = hash(payload)
      return { inputHash, outputHash, eventHash, signature: sign(null, Buffer.from(eventHash, 'hex'), privateKey).toString('base64') }
    },
  }
}
