import type { Capability, ResourcePolicy } from '../../../packages/node-protocol/index.ts'
import { supportsWork, withinSchedule } from '../../../packages/node-protocol/index.ts'

export const DISPATCH_REASONS = [
  'accepted',
  'task_not_ready',
  'no_matching_task',
  'consent_required',
  'node_not_enrolled',
  'heartbeat_required',
  'policy_disabled',
  'outside_schedule',
  'model_not_allowed',
  'model_not_reported',
  'capability_not_allowed',
  'capability_not_reported',
  'node_capacity_reached',
  'task_capacity_reached',
] as const

export type DispatchReason = (typeof DISPATCH_REASONS)[number]
export type DispatchDecision = {
  accepted: boolean
  reason: DispatchReason
  retryAfterMs: number
}

export type DispatchFacts = {
  taskStatus: string
  consented: boolean
  nodeStatus: string
  heartbeatFresh: boolean
  policy: ResourcePolicy
  model: string
  reportedModels: readonly string[]
  taskType: string
  operation: string
  reportedCapabilities: readonly string[]
  nodeActive: number
  nodeLimit: number
  taskActive: number
  taskLimit: number
  now?: Date
}

const reject = (reason: DispatchReason, retryAfterMs = 15_000): DispatchDecision => ({ accepted: false, reason, retryAfterMs })

export function decideDispatch(facts: DispatchFacts): DispatchDecision {
  if (!['queued', 'running'].includes(facts.taskStatus)) return reject('task_not_ready', 30_000)
  if (!facts.consented) return reject('consent_required', 30_000)
  if (facts.nodeStatus !== 'enrolled') return reject('node_not_enrolled', 30_000)
  if (!facts.heartbeatFresh) return reject('heartbeat_required', 15_000)
  if (!facts.policy.enabled) return reject('policy_disabled', 30_000)
  if (!withinSchedule(facts.policy, facts.now)) return reject('outside_schedule', 30_000)
  if (!facts.policy.allowedModels.includes(facts.model)) return reject('model_not_allowed', 30_000)
  if (!facts.reportedModels.includes(facts.model)) return reject('model_not_reported', 15_000)
  const capability = `${facts.taskType}:${facts.operation}` as Capability
  if (!supportsWork(facts.policy.allowedCapabilities, facts.taskType, facts.operation)) return reject('capability_not_allowed', 30_000)
  if (!supportsWork(facts.reportedCapabilities, facts.taskType, facts.operation)) return reject('capability_not_reported', 15_000)
  if (facts.nodeActive >= facts.nodeLimit) return reject('node_capacity_reached', 3_000)
  if (facts.taskActive >= facts.taskLimit) return reject('task_capacity_reached', 3_000)
  return { accepted: true, reason: 'accepted', retryAfterMs: 0 }
}

export const dispatchReasonLabels: Record<DispatchReason, { zh: string; en: string }> = {
  accepted: { zh: '准入通过', en: 'Accepted' },
  task_not_ready: { zh: '任务尚不可领取', en: 'Task is not ready' },
  no_matching_task: { zh: '暂无匹配任务', en: 'No matching task' },
  consent_required: { zh: '缺少执行授权', en: 'Execution consent required' },
  node_not_enrolled: { zh: '节点未处于接单状态', en: 'Node is not accepting work' },
  heartbeat_required: { zh: '节点心跳已过期', en: 'Node heartbeat is stale' },
  policy_disabled: { zh: '接单策略已关闭', en: 'Dispatch policy is disabled' },
  outside_schedule: { zh: '当前不在接单时段', en: 'Outside dispatch schedule' },
  model_not_allowed: { zh: '模型未获策略授权', en: 'Model is not allowed' },
  model_not_reported: { zh: '节点未报告该模型', en: 'Model is not reported' },
  capability_not_allowed: { zh: '能力未获策略授权', en: 'Capability is not allowed' },
  capability_not_reported: { zh: '节点未报告该能力', en: 'Capability is not reported' },
  node_capacity_reached: { zh: '节点并发已满', en: 'Node concurrency reached' },
  task_capacity_reached: { zh: '任务并发已满', en: 'Task concurrency reached' },
}
