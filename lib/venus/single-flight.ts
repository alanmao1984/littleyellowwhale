export function createSingleFlightCooldown<T>(cooldownMs: number, now: () => number = Date.now) {
  const inFlight = new Map<string, Promise<T>>()
  const blockedUntil = new Map<string, number>()

  return (key: string, task: () => Promise<T>): Promise<T | undefined> => {
    const current = inFlight.get(key)
    if (current) return current
    if ((blockedUntil.get(key) ?? 0) > now()) return Promise.resolve(undefined)

    const promise = Promise.resolve().then(task)
    inFlight.set(key, promise)
    void promise.finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key)
      blockedUntil.set(key, now() + cooldownMs)
    }).catch(() => undefined)
    return promise
  }
}
