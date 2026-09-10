const allowedHost = process.env.VENUS_TEST_DATABASE_HOST
const databaseUrl = process.env.DATABASE_URL
if (!allowedHost || !databaseUrl || new URL(databaseUrl).hostname !== allowedHost || allowedHost === process.env.VENUS_SOURCE_DATABASE_HOST) {
  throw new Error('集成测试只允许显式指定的隔离数据库；禁止使用默认项目数据库。')
}
export {}
