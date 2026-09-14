import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveCaptchaConfig, TEST_SITE_KEY, TEST_SECRET_KEY, captchaProtectedPath } from '../lib/venus/auth-config.ts'
import { sendOtpEmail } from '../lib/venus/email.ts'

test('生产缺任一验证码配置或使用官方测试密钥均失败关闭', () => {
  for (const env of [{}, { NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'real-site' }, { TURNSTILE_SECRET_KEY: 'real-secret' }, { NEXT_PUBLIC_TURNSTILE_SITE_KEY: TEST_SITE_KEY, TURNSTILE_SECRET_KEY: TEST_SECRET_KEY }, { NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'real-site', TURNSTILE_SECRET_KEY: TEST_SECRET_KEY }]) assert.equal(resolveCaptchaConfig({ ...env, NODE_ENV: 'production' }).ready, false)
  assert.equal(resolveCaptchaConfig({ NODE_ENV: 'production', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'real-site', TURNSTILE_SECRET_KEY: 'real-secret' }).ready, true)
})
test('开发环境始终成对使用官方测试键，避免临时预览域名被生产控件拒绝', () => {
  for (const env of [
    {},
    { NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'only-one' },
    { NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'real-site', TURNSTILE_SECRET_KEY: 'real-secret' },
  ]) {
    const config = resolveCaptchaConfig({ ...env, NODE_ENV: 'development' })
    assert.equal(config.ready, true)
    assert.equal(config.siteKey, TEST_SITE_KEY)
    assert.equal(config.secretKey, TEST_SECRET_KEY)
    assert.equal(config.testing, true)
  }
})
test('敏感密码与 OTP 端点受保护，退出及会话读取不受配置故障影响', () => {
  for (const path of ['/sign-in/email', '/sign-up/email', '/sign-in/email-otp', '/email-otp/send-verification-otp', '/email-otp/verify-email', '/reset-password']) assert.equal(captchaProtectedPath(path), true)
  for (const path of ['/sign-out', '/get-session', '/callback/google']) assert.equal(captchaProtectedPath(path), false)
})
test('邮件缺配置抛通用错误而非输出 OTP；失败、超时不返回成功；幂等键不含 OTP', async t => {
  const env = { ...process.env }
  const logs = []
  t.mock.method(console, 'log', (...args) => logs.push(args))
  try {
    delete process.env.RESEND_API_KEY
    await assert.rejects(sendOtpEmail({ to: 'delivered@resend.dev', otp: '123456', type: 'sign-in' }), /暂不可用/)
    assert.equal(logs.length, 0)
    process.env.RESEND_API_KEY = 'unit-test-not-a-key'; process.env.RESEND_EMAIL_DOMAIN = 'example.test'; process.env.BETTER_AUTH_SECRET = 'unit-test-only-not-used-in-app'
    const keys = []
    let status = 200
    t.mock.method(globalThis, 'fetch', async (_url, options) => { keys.push(options.headers['Idempotency-Key']); return new Response('{}', { status }) })
    const input = { to: 'delivered@resend.dev', otp: '123456', type: 'sign-in' }
    await sendOtpEmail(input); await sendOtpEmail(input)
    assert.equal(keys[0], keys[1]); assert.ok(!keys[0].includes('123456'))
    await sendOtpEmail({ ...input, type: 'email-verification' }); assert.notEqual(keys[0], keys[2])
    status = 503; await assert.rejects(sendOtpEmail(input), /发送失败/)
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('network detail') })
    await assert.rejects(sendOtpEmail(input), /发送失败/)
    assert.equal(logs.length, 0)
  } finally { for (const key of ['RESEND_API_KEY', 'RESEND_EMAIL_DOMAIN', 'BETTER_AUTH_SECRET']) { if (env[key] === undefined) delete process.env[key]; else process.env[key] = env[key] } }
})
