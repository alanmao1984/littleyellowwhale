import { createHmac } from 'node:crypto'

type OtpType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'
export async function sendOtpEmail({ to, otp, type }: { to: string; otp: string; type: OtpType }) {
  const apiKey = process.env.RESEND_API_KEY
  const domain = process.env.RESEND_EMAIL_DOMAIN
  const secret = process.env.BETTER_AUTH_SECRET
  if (!apiKey || !domain || !secret || !/^[a-zA-Z0-9.-]+$/.test(domain) || !/^\d{6}$/.test(otp)) throw new Error('验证码发送暂不可用')
  const recipient = to.trim().toLowerCase()
  const eventKey = createHmac('sha256', secret).update(JSON.stringify([recipient, type, otp])).digest('hex')
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `email-otp/${eventKey}` },
      body: JSON.stringify({ from: `Venus <auth@${domain}>`, to: [recipient], subject: 'Venus 邮箱验证码',
        text: `你的 Venus 邮箱验证码是 ${otp}，有效期为 5 分钟。若不是你本人操作，请忽略此邮件。` }),
    })
    if (!response.ok) { await response.body?.cancel(); throw new Error('email_delivery_failed') }
    await response.body?.cancel()
  } catch {
    throw new Error('验证码发送失败，请稍后重试')
  }
}
