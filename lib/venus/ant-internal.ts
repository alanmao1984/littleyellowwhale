import 'server-only'

export type PublicDispatchCandidate = {
  offeringId: string
  inputUnitPrice: string
  createdAt: Date
  pogwScore: number
}

export type InternalDispatchRanker = (candidates: readonly PublicDispatchCandidate[]) => Promise<readonly string[]>

function internalModuleSpecifier() {
  if (process.env.ANT_INTERNAL_BUILD !== '1') return null
  const value = process.env.ANT_INTERNAL_DISPATCH_MODULE?.trim()
  return value || null
}

export async function rankWithAntInternal(candidates: readonly PublicDispatchCandidate[]) {
  const specifier = internalModuleSpecifier()
  if (!specifier) return null
  try {
    // The specifier is supplied only by the private build pipeline. Keeping it
    // dynamic means public builds neither resolve nor bundle proprietary code.
    const load = new Function('specifier', 'return import(specifier)') as (value: string) => Promise<{ rankDispatchCandidates?: InternalDispatchRanker }>
    const module = await load(specifier)
    if (typeof module.rankDispatchCandidates !== 'function') return null
    return await module.rankDispatchCandidates(candidates)
  } catch {
    return null
  }
}

export function publicDispatchOrder<T extends PublicDispatchCandidate>(candidates: readonly T[]) {
  return [...candidates].sort((a, b) => {
    const pogw = b.pogwScore - a.pogwScore
    if (pogw !== 0) return pogw
    const price = Number(a.inputUnitPrice) - Number(b.inputUnitPrice)
    return price || a.createdAt.getTime() - b.createdAt.getTime()
  })
}
