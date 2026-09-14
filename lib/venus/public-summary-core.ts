export type PublicSummaryState = 'live' | 'unavailable'

export type PublicPlatformSummary = {
  todayTokens: number
  gatewayAvailability: number | null
  activePublicNodes: number
  settledCalls: number
  state: PublicSummaryState
  measuredAt: string
}

export function calculateGatewayAvailability(completed: number, total: number): number | null {
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) return null
  const safeCompleted = Math.min(Math.max(Math.trunc(completed), 0), Math.trunc(total))
  return Number(((safeCompleted / Math.trunc(total)) * 100).toFixed(2))
}

export function buildPublicPlatformSummary(input: {
  todayTokens: number
  completedRequests: number
  totalRequests: number
  activePublicNodes: number
  settledCalls: number
  measuredAt?: Date
}): PublicPlatformSummary {
  const finiteNonNegative = (value: number) => Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  return {
    todayTokens: finiteNonNegative(input.todayTokens),
    gatewayAvailability: calculateGatewayAvailability(input.completedRequests, input.totalRequests),
    activePublicNodes: finiteNonNegative(input.activePublicNodes),
    settledCalls: finiteNonNegative(input.settledCalls),
    state: 'live',
    measuredAt: (input.measuredAt ?? new Date()).toISOString(),
  }
}

export function unavailablePublicPlatformSummary(measuredAt = new Date()): PublicPlatformSummary {
  return {
    todayTokens: 0,
    gatewayAvailability: null,
    activePublicNodes: 0,
    settledCalls: 0,
    state: 'unavailable',
    measuredAt: measuredAt.toISOString(),
  }
}
