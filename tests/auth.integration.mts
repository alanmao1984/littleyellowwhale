import './isolated-db.mts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { eq, and, inArray, like } from 'drizzle-orm'
import { db, pool } from '../lib/db/index'
import { user, session, account, rateLimit } from '../lib/db/schema'

// Provider verification is stubbed only inside this isolated test process.
// Better Auth handlers, password hashing, sessions and rate-limit storage are real.
process.env.NODE_ENV = 'development'
process.env.BETTER_AUTH_URL = 'http://localhost:3000'
process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA'

test('隔离 Better Auth：token 校验、密码会话、退出与持久化限流', async t => {
  const { auth } = await import('../lib/auth')
  const email = `venus-auth-test-${randomUUID()}@example.test`
  const password = `${randomUUID()}Aa!`
  const oldLimits = await db.select({ id: rateLimit.id }).from(rateLimit)
  const used = new Set<string>()
  const nativeFetch = globalThis.fetch
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input).startsWith('https://challenges.cloudflare.com/turnstile/v0/siteverify')) {
      const body = JSON.parse(String(init?.body)) as { response: string }
      const success = body.response.startsWith('valid-') && !used.has(body.response)
      used.add(body.response)
      return Response.json({ success, 'error-codes': success ? [] : ['timeout-or-duplicate'] })
    }
    return nativeFetch(input, init)
  })
  let userId: string | undefined
  const request = (path: string, body: unknown, token?: string, cookie?: string) => auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
    method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json', ...(token ? { 'x-captcha-response': token } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
  }))
  try {
    await t.test('缺 token、失效 token 均不能注册', async () => {
      assert.ok((await request('/sign-up/email', { email, password, name: '隔离认证测试' })).status >= 400)
      assert.ok((await request('/sign-up/email', { email, password, name: '隔离认证测试' }, 'invalid-token')).status >= 400)
    })
    let cookie = ''
    await t.test('真实注册设置 HttpOnly Secure SameSite=None，会话重新读取有效', async () => {
      const response = await request('/sign-up/email', { email, password, name: '隔离认证测试' }, 'valid-register')
      assert.equal(response.status, 200)
      const body = await response.json(); userId = body.user.id
      const sessionCookie = response.headers.getSetCookie().find(value => value.includes('session_token='))
      assert.ok(sessionCookie); assert.ok(/httponly/i.test(sessionCookie)); assert.ok(/secure/i.test(sessionCookie)); assert.ok(/samesite=none/i.test(sessionCookie))
      cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      for (let i = 0; i < 2; i++) {
        const current = await auth.handler(new Request('http://localhost:3000/api/auth/get-session', { headers: { Cookie: cookie } }))
        assert.equal((await current.json()).user.id, userId)
      }
    })
    await t.test('重复 token 拒绝；退出撤销会话；新 token 密码登录成功', async () => {
      assert.ok((await request('/sign-in/email', { email, password }, 'valid-register')).status >= 400)
      assert.equal((await request('/sign-out', {}, undefined, cookie)).status, 200)
      const signedOut = await auth.handler(new Request('http://localhost:3000/api/auth/get-session', { headers: { Cookie: cookie } }))
      assert.equal(await signedOut.json(), null)
      assert.equal((await request('/sign-in/email', { email, password }, 'valid-login')).status, 200)
    })
    await t.test('高频认证被 429 拒绝，计数真实落在 rate_limit 表', async () => {
      const statuses = []
      for (let i = 0; i < 8; i++) statuses.push((await request('/sign-in/email', { email, password: 'wrong-password' }, `valid-limit-${i}`)).status)
      assert.ok(statuses.includes(429))
      const current = await db.select({ count: rateLimit.count }).from(rateLimit)
      assert.ok(current.some(row => row.count >= 5))
    })
  } finally {
    if (!userId) { const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)); userId = row?.id }
    if (userId) await db.transaction(async tx => {
      await tx.delete(session).where(eq(session.userId, userId!)); await tx.delete(account).where(eq(account.userId, userId!)); await tx.delete(user).where(and(eq(user.id, userId!), like(user.email, 'venus-auth-test-%@example.test')))
    })
    const existing = new Set(oldLimits.map(row => row.id))
    const added = (await db.select({ id: rateLimit.id }).from(rateLimit)).filter(row => !existing.has(row.id)).map(row => row.id)
    if (added.length) await db.delete(rateLimit).where(inArray(rateLimit.id, added))
    await pool.end()
  }
})
