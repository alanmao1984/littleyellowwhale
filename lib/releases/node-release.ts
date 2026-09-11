import { z } from 'zod'

export const NODE_RELEASE_REPOSITORY = 'alanmao1984/littleyellowwhale'
export const NODE_RELEASE_PLATFORMS = ['windows', 'macos-arm64', 'macos-x64'] as const
export type NodeReleasePlatform = (typeof NODE_RELEASE_PLATFORMS)[number]

export const NODE_RELEASE_ASSETS: Record<NodeReleasePlatform, string> = {
  windows: 'venus-node-windows-x64-setup.exe',
  'macos-arm64': 'venus-node-macos-arm64.pkg',
  'macos-x64': 'venus-node-macos-x64.pkg',
}

export const RELEASE_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600'
export const RELEASE_ERROR_CACHE_CONTROL = 'no-store'

const releaseSchema = z.object({
  tag_name: z.string().regex(/^node-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  draft: z.literal(false),
  prerelease: z.literal(false),
  assets: z.array(z.object({
    name: z.string().max(160),
    browser_download_url: z.string().url(),
  })).max(64),
})

export type NodeReleaseAsset = { name: string; url: string }
export type NodeRelease = { version: string; tag: string; assets: Partial<Record<NodeReleasePlatform, NodeReleaseAsset>> }

type ReleaseFetch = (input: string, init?: RequestInit & { next?: { revalidate: number } }) => Promise<Response>

export function isNodeReleasePlatform(value: string): value is NodeReleasePlatform {
  return NODE_RELEASE_PLATFORMS.includes(value as NodeReleasePlatform)
}

export function parseNodeRelease(input: unknown): NodeRelease | null {
  const parsed = releaseSchema.safeParse(input)
  if (!parsed.success) return null
  const assets: Partial<Record<NodeReleasePlatform, NodeReleaseAsset>> = {}
  for (const platform of NODE_RELEASE_PLATFORMS) {
    const name = NODE_RELEASE_ASSETS[platform]
    const expected = `https://github.com/${NODE_RELEASE_REPOSITORY}/releases/download/${parsed.data.tag_name}/${name}`
    const candidate = parsed.data.assets.find(asset => asset.name === name && asset.browser_download_url === expected)
    if (candidate) assets[platform] = { name, url: candidate.browser_download_url }
  }
  return {
    version: parsed.data.tag_name.slice('node-v'.length),
    tag: parsed.data.tag_name,
    assets,
  }
}

export async function getLatestNodeRelease(fetcher: ReleaseFetch = fetch): Promise<NodeRelease | null> {
  const response = await fetcher(`https://api.github.com/repos/${NODE_RELEASE_REPOSITORY}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'littleyellowwhale-download-resolver',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    next: { revalidate: 300 },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error('release_lookup_failed')
  return parseNodeRelease(await response.json())
}

export function nodeReleaseManifest(release: NodeRelease | null) {
  return {
    version: release?.version ?? null,
    platforms: Object.fromEntries(NODE_RELEASE_PLATFORMS.map(platform => [platform, {
      available: Boolean(release?.assets[platform]),
      fileName: NODE_RELEASE_ASSETS[platform],
    }])) as Record<NodeReleasePlatform, { available: boolean; fileName: string }>,
  }
}
