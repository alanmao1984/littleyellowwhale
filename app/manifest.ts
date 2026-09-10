import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '小黄鲸 Venus', short_name: '小黄鲸', description: '让每一份算力都有用武之地',
    start_url: '/', scope: '/', display: 'standalone', lang: 'zh-CN',
    background_color: '#f7f8fa', theme_color: '#f7f8fa',
    icons: [{ src: '/app-icon', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  }
}
