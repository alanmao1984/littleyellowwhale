import type { Metadata, Viewport } from 'next'
import { Noto_Sans_SC, Geist_Mono } from 'next/font/google'
import './globals.css'

const geist = Noto_Sans_SC({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  metadataBase: new URL('https://xiaohuangjing.com'),
  title: '小黄鲸 Venus｜AI 算力流动性网络',
  description: '聚合 API、GPU 与智能体能力，通过可信路由、微结算和动态市场，让每一份闲置算力持续流动。',
  applicationName: '小黄鲸 Venus',
  keywords: ['AI 算力', 'GPU 节点', 'AI Gateway', '算力市场', 'Venus'],
  icons: {
    icon: [
      { url: '/brand/venus-favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/brand/venus-app-icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/brand/venus-apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  openGraph: {
    title: '小黄鲸 Venus｜让每一份闲置算力持续流动',
    description: '统一 AI 算力银行与可信微结算网络。',
    type: 'website',
    locale: 'zh_CN',
    images: [{ url: '/brand/venus-github-social.jpg', width: 1280, height: 640, alt: '小黄鲸 Venus 品牌标识' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '小黄鲸 Venus｜让每一份闲置算力持续流动',
    description: '统一 AI 算力银行与可信微结算网络。',
    images: ['/brand/venus-github-social.jpg'],
  },
}

export const viewport: Viewport = {
  themeColor: '#05080a',
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
}


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN" className={`bg-background ${geist.variable} ${geistMono.variable}`}><body className="font-sans antialiased">{children}</body></html>
}
