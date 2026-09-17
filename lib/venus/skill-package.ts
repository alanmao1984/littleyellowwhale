import { posix } from 'node:path'
import { z } from 'zod'

export const MAX_SKILL_PACKAGE_BYTES = 8 * 1024 * 1024
export const MAX_SKILL_FILES = 512

const entrySchema = z.object({ path: z.string().min(1).max(512), size: z.number().int().min(0).max(MAX_SKILL_PACKAGE_BYTES) }).strict()
export const skillPackageManifestSchema = z.object({ entries: z.array(entrySchema).min(1).max(MAX_SKILL_FILES) }).strict()

export type SkillPackageRejection = 'invalid_manifest' | 'package_too_large' | 'unsafe_path' | 'duplicate_path'
export type SkillPackageValidation =
  | { ok: true; totalBytes: number; fileCount: number }
  | { ok: false; reason: SkillPackageRejection; path?: string }

export function isSafeSkillPath(rawPath: string) {
  if (rawPath.includes('\0') || rawPath.includes('\\') || rawPath.startsWith('/') || /^[A-Za-z]:/.test(rawPath)) return false
  const normalized = posix.normalize(rawPath)
  return normalized !== '.' && normalized !== '..' && !normalized.startsWith('../') && normalized === rawPath && !rawPath.split('/').includes('')
}

export function validateSkillPackage(input: unknown): SkillPackageValidation {
  const parsed = skillPackageManifestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid_manifest' }
  const seen = new Set<string>()
  let totalBytes = 0
  for (const entry of parsed.data.entries) {
    if (!isSafeSkillPath(entry.path)) return { ok: false, reason: 'unsafe_path', path: entry.path }
    if (seen.has(entry.path)) return { ok: false, reason: 'duplicate_path', path: entry.path }
    seen.add(entry.path)
    totalBytes += entry.size
    if (totalBytes > MAX_SKILL_PACKAGE_BYTES) return { ok: false, reason: 'package_too_large' }
  }
  return { ok: true, totalBytes, fileCount: parsed.data.entries.length }
}
