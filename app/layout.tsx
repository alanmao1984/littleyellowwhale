import type { Metadata, Viewport } from 'next'
import { Noto_Sans_SC, Geist_Mono } from 'next/font/google'
import './globals.css'

const geist = Noto_Sans_SC({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: '小黄鲸 Venus · 让每一份算力都有用武之地',
  description: '小黄鲸 Venus 分布式 AI 算力工作台：连接自有节点、公网文本 API VTEST 市场、私有视频处理与企业学校组织算力；所有资金均为不可提现测试账本。',
  applicationName: '小黄鲸 Venus',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: '小黄鲸 Venus', statusBarStyle: 'default' },
  icons: { icon: '/images/venus-whale.png', apple: '/images/venus-whale.png' },
}

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, colorScheme: 'light', themeColor: '#f7f8fa',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN" className={`bg-background ${geist.variable} ${geistMono.variable}`}><body className="font-sans antialiased">{children}</body></html>
}
