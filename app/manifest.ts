import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '小黄鲸 Venus', short_name: '小黄鲸', description: '让每一份算力都有用武之地',
    start_url: '/', scope: '/', display: 'standalone', lang: 'zh-CN',
    background_color: '#111820', theme_color: '#111820',
    icons: [
      { src: '/brand/venus-app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/venus-app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/venus-maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
