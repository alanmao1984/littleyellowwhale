import { createHash } from 'node:crypto'

type OtpType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'

function getSender() {
  const domain = process.env.RESEND_EMAIL_DOMAIN
  if (!domain) throw new Error('RESEND_EMAIL_DOMAIN is not configured')
  return `Venus <auth@${domain}>`
}

export async function sendOtpEmail({ to, otp, type }: { to: string; otp: string; type: OtpType }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[v0] OTP for ${type}: ${otp}`)
      return
    }
    throw new Error('RESEND_API_KEY is not configured')
  }

  const recipientKey = createHash('sha256').update(to.trim().toLowerCase()).digest('hex').slice(0, 20)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `email-otp/${recipientKey}/${otp}`,
    },
    body: JSON.stringify({
      from: getSender(),
      to: [to],
      subject: 'Venus 登录验证码',
      text: `你的 Venus 登录验证码是 ${otp}，有效期为 5 分钟。若不是你本人操作，请忽略此邮件。`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#19221d"><h2>Venus 登录验证码</h2><p>你的验证码是：</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${otp}</p><p>验证码有效期为 5 分钟。若不是你本人操作，请忽略此邮件。</p></div>`,
    }),
  })

  if (!response.ok) {
    console.error('[v0] Failed to send login OTP email:', response.status)
    throw new Error('Unable to send login code')
  }
}
