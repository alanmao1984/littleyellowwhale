import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

export type SessionUser = { id: string; name: string; email: string }

// Reads the current Better Auth session on the server. Returns null when the
// database or auth is not yet reachable so pages still render a guest view.
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user) return null
    return { id: session.user.id, name: session.user.name, email: session.user.email }
  } catch {
    return null
  }
}
