import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { assignmentSchema, canExecute, resourcePolicySchema, type Assignment, type ResourcePolicy, type ResultInput } from '../../node-protocol/index.ts'
import { adapterCapabilities, boundedJson, detectModels, executeMedia, infer, type AdapterConfig } from './adapters.ts'
import { createAttestationIdentity } from './attestation.ts'
import type { HardwareProfile, HermesStatus } from '../../node-protocol/index.ts'

export function platformUrl(value: string) {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('平台地址必须为不带路径或凭据的根域名。')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname))) throw new Error('平台必须使用 HTTPS；仅回环测试允许 HTTP。')
  return url.origin
}
export async function platformRequest(base: string, path: string, token: string | null, body: unknown) {
  const response = await fetch(`${platformUrl(base)}${path}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`平台拒绝请求 (${response.status})`)
  return boundedJson(response)
}
export async function retryClaim(call: () => Promise<unknown>, stop: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    stop.throwIfAborted()
    try { return z.object({ assignment: assignmentSchema.nullable() }).parse(await call()) }
    catch (error) { if (attempt >= 2) throw error; await delay(1000, undefined, { signal: stop }) }
  }
}
export type RuntimeConfig = { platform: string; token: string; adapter: AdapterConfig; allowedModels: string[]; maxConcurrency: number; hardware: HardwareProfile; hermes: HermesStatus }
export async function runNode(config: RuntimeConfig, stop: AbortSignal, report: (message: string) => void = console.log) {
  const attestation = createAttestationIdentity()
  const jobs = new Map<string, { promise: Promise<void>; controller: AbortController }>()
  let policy: ResourcePolicy | null = null
  let available: string[] = []
  let accepting = false
  let heartbeatAt = 0
  const call = (path: string, payload: unknown) => platformRequest(config.platform, path, config.token, payload)
  const localAllows = (work: Assignment) => config.allowedModels.includes(work.model) && available.includes(work.model) && policy && canExecute(policy, work.model) && adapterCapabilities(config.adapter).some(capability => capability === `${work.taskType}:${work.operation}`) && policy.allowedCapabilities.some(capability => capability === `${work.taskType}:${work.operation}`)
  async function execute(work: Assignment, controller: AbortController) {
    let done = false
    let reason: ResultInput['errorCode'] = work.taskType === 'text' ? 'inference_error' : 'media_error'
    const renewalStop = new AbortController()
    const onStop = () => { reason = 'shutdown'; controller.abort() }
    stop.addEventListener('abort', onStop, { once: true })
    if (stop.aborted) onStop()
    const renew = async () => {
      const response = z.object({ cancelRequested: z.boolean(), leaseExpiresAt: z.string().datetime() }).parse(await call('/api/node/renew', { attemptId: work.attemptId, fence: work.fence }))
      if (response.cancelRequested || !localAllows(work)) { reason = 'cancel_requested'; controller.abort(); return false }
      return true
    }
    const renewing = (async () => {
      while (!done && !controller.signal.aborted) {
        try { await delay(15000, undefined, { signal: renewalStop.signal }); if (!done) await renew() }
        catch { if (!done) { reason = 'lease_lost'; controller.abort() }; break }
      }
    })()
    let result: ResultInput
    try {
      if (!localAllows(work) || !await renew() || controller.signal.aborted) throw new Error('未授权执行')
      const output = work.taskType === 'text' ? await infer(config.adapter, work, controller.signal) : await executeMedia(config.adapter, work, controller.signal, { platform: platformUrl(config.platform), nodeToken: config.token })
      if (controller.signal.aborted) throw new Error('执行已请求中止')
      result = { attemptId: work.attemptId, fence: work.fence, model: work.model, outcome: 'completed', ...output }
    } catch {
      result = { attemptId: work.attemptId, fence: work.fence, model: work.model, outcome: 'uncertain', errorCode: reason }
    } finally {
      done = true; renewalStop.abort(); stop.removeEventListener('abort', onStop); await renewing
    }
    result = { ...result, usageReceipt: attestation.signResult({ attemptId: work.attemptId, fence: work.fence, model: work.model, input: `${work.instruction}\n${work.input}`, output: result.output, usage: result.usage }) }
    // Retry only the identical result envelope, never the inference itself.
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await call('/api/node/result', result); report('执行记录已回传，等待核验。'); return }
      catch { if (attempt < 2) await delay(1000) }
    }
    report('结果未确认送达；平台将保留待核验，不重新执行。')
  }
  try {
    while (!stop.aborted) {
      try {
        if (Date.now() - heartbeatAt >= 15000) {
          available = (await detectModels(config.adapter)).filter(m => config.allowedModels.includes(m)).slice(0, 32)
          if (config.hermes.enabled && config.hermes.proxyPort) {
            try { const response = await fetch(`http://127.0.0.1:${config.hermes.proxyPort}/`, { redirect: 'manual', signal: AbortSignal.timeout(2500) }); config.hermes = { ...config.hermes, status: response.status > 0 ? 'healthy' : 'unreachable' } }
            catch { config.hermes = { ...config.hermes, status: 'unreachable' } }
          }
          const heartbeat = z.object({ status: z.string(), policy: resourcePolicySchema }).parse(await call('/api/node/heartbeat', { models: available, capabilities: adapterCapabilities(config.adapter), hardware: config.hardware, hermes: config.hermes, attestationPublicKey: attestation.publicKey }))
          policy = heartbeat.policy; accepting = heartbeat.status === 'enrolled'; heartbeatAt = Date.now()
          for (const job of jobs.values()) if (!accepting || !policy.enabled) job.controller.abort()
        }
        if (accepting && policy && jobs.size < Math.min(config.maxConcurrency, policy.maxConcurrency) && available.some(m => canExecute(policy!, m))) {
          const requestId = randomUUID()
          const envelope = await retryClaim(() => call('/api/node/claim', { requestId }), stop)
          if (envelope.assignment) {
            const work = envelope.assignment
            if (jobs.has(work.attemptId)) continue
            const controller = new AbortController()
            const promise = execute(work, controller).finally(() => jobs.delete(work.attemptId))
            jobs.set(work.attemptId, { promise, controller })
            continue
          }
        }
      } catch {
        accepting = false; heartbeatAt = 0
        report('连接或本机服务暂不可用，已暂停领取；稍后重新检查。')
      }
      await delay(3000, undefined, { signal: stop }).catch(() => undefined)
    }
  } finally {
    for (const job of jobs.values()) job.controller.abort()
    await Promise.allSettled([...jobs.values()].map(j => j.promise))
  }
}
