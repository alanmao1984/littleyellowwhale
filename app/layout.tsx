import type { Metadata, Viewport } from 'next'
import { Noto_Sans_SC, Geist_Mono } from 'next/font/google'
import './globals.css'

const geist = Noto_Sans_SC({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: '小黄鲸 Venus · 让每一份算力都有用武之地',
  description: '小黄鲸 Venus 本地算力工作台。明确授权节点、模型与接单时段，管理批量文本任务、租约进度与待核验结果；资金均为不可提现测试账本。',
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
