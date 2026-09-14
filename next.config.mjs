import { withWorkflow } from 'workflow/next'

/** @type {import('next').NextConfig} */
const dashboardSections = ['tasks', 'compute', 'text-market', 'video-market', 'market', 'organizations', 'nodes', 'earnings', 'developers', 'settings']

const deploymentVersion = process.env.BUILD_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA

const nextConfig = {
  output: 'standalone',
  ...(deploymentVersion ? { deploymentId: deploymentVersion } : {}),
  async redirects() {
    return [
      ...dashboardSections.map(section => ({ source: `/${section}`, destination: `/app/${section}`, permanent: true })),
      { source: '/wallet', destination: '/app/earnings', permanent: true },
    ]
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }]
  },
  images: {
    unoptimized: true,
  },
}

export default withWorkflow(nextConfig)
