import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { registerCompletedUpload, safeMediaUpload } from '@/lib/venus/private-media'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const body = await request.json() as HandleUploadBody
  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await auth.api.getSession({ headers: await headers() })
        if (!session?.user || !clientPayload) throw new Error('unauthorized')
        const safe = safeMediaUpload(session.user.id, pathname, JSON.parse(clientPayload))
        if (!safe) throw new Error('invalid_upload')
        return { allowedContentTypes: [safe.contentType], maximumSizeInBytes: safe.byteSize, validUntil: Date.now() + 15 * 60_000, addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 0, tokenPayload: JSON.stringify(safe) }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) throw new Error('missing_upload_context')
        const safe = JSON.parse(tokenPayload) as Parameters<typeof registerCompletedUpload>[0]
        if (safe.pathname !== blob.pathname || safe.contentType !== blob.contentType) throw new Error('upload_context_mismatch')
        await registerCompletedUpload(safe)
      },
    })
    return Response.json(result)
  } catch {
    return Response.json({ error: 'upload_rejected' }, { status: 400 })
  }
}
