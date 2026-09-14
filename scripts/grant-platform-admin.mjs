// One-time bootstrap for the first platform_admin. It never guesses a target:
// the operator must pass exactly one existing user, by --email or --user-id.
// Run with the unpooled connection so the whole grant + audit is one transaction:
//
//   node --env-file-if-exists=.env.development.local scripts/grant-platform-admin.mjs --email owner@example.com --reason "launch bootstrap"
//   pnpm grant:platform-admin -- --user-id <id>
//
// Re-running for the same user is idempotent: an already-active grant is a no-op,
// and a previously revoked grant is re-activated. Revocation is done via the
// database (status='revoked'), never by deleting history.
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--email') args.email = argv[++i]
    else if (token === '--user-id') args.userId = argv[++i]
    else if (token === '--reason') args.reason = argv[++i]
    else {
      console.error(`未知参数: ${token}`)
      process.exit(2)
    }
  }
  return args
}

function fail(message) {
  console.error(`拒绝授予平台管理员: ${message}`)
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
if (!!args.email === !!args.userId) fail('必须且只能提供 --email 或 --user-id 其中之一。')
const reason = (args.reason ?? '首位平台管理员初始化').trim()
if (!reason) fail('--reason 不能为空。')

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!connectionString) fail('缺少 DATABASE_URL_UNPOOLED / DATABASE_URL 环境变量。')

const pool = new Pool({ connectionString, max: 1 })
const grantedBy = 'script:grant-platform-admin'

try {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Resolve the target to exactly one existing user; ambiguity or absence aborts.
    const lookup = args.email
      ? await client.query('SELECT id, email FROM "user" WHERE lower(email) = lower($1)', [args.email.trim()])
      : await client.query('SELECT id, email FROM "user" WHERE id = $1', [args.userId.trim()])
    if (lookup.rowCount === 0) {
      await client.query('ROLLBACK')
      fail('未找到匹配的现有用户。')
    }
    if (lookup.rowCount > 1) {
      await client.query('ROLLBACK')
      fail('目标用户不唯一，拒绝执行。')
    }
    const target = lookup.rows[0]

    const existing = await client.query('SELECT id, status FROM platform_roles WHERE "userId" = $1 FOR UPDATE', [target.id])
    let action = 'platform_role.granted'
    if (existing.rowCount > 0 && existing.rows[0].status === 'active') {
      await client.query('COMMIT')
      console.log(`用户 ${target.email} (${target.id}) 已经是活跃的 platform_admin，未做更改（幂等）。`)
      process.exit(0)
    } else if (existing.rowCount > 0) {
      await client.query(
        'UPDATE platform_roles SET role = $2, status = $3, "grantedBy" = $4, "grantedReason" = $5, "grantedAt" = now(), "revokedAt" = NULL, "updatedAt" = now() WHERE "userId" = $1',
        [target.id, 'platform_admin', 'active', grantedBy, reason],
      )
      action = 'platform_role.regranted'
    } else {
      await client.query(
        'INSERT INTO platform_roles (id, "userId", role, status, "grantedBy", "grantedReason") VALUES ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), target.id, 'platform_admin', 'active', grantedBy, reason],
      )
    }

    await client.query(
      'INSERT INTO platform_audit_events (id, "actorId", action, "targetType", "targetId", summary) VALUES ($1, $2, $3, $4, $5, $6)',
      [randomUUID(), grantedBy, action, 'platform_role', target.id, JSON.stringify({ role: 'platform_admin', reason, via: args.email ? 'email' : 'user-id' })],
    )

    await client.query('COMMIT')
    console.log(`已授予 platform_admin：${target.email} (${target.id})，动作 ${action}。`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
} catch (error) {
  console.error('授予平台管理员失败:', error instanceof Error ? error.message : error)
  process.exit(1)
} finally {
  await pool.end()
}
