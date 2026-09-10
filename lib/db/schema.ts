import { boolean, integer, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

// App tables use a plain userId column for per-user scoping (there is no RLS on
// Neon) and intentionally carry no foreign keys, per the Neon stack guidance.
// All money is numeric(18,4) and always crosses boundaries as a string so no
// JavaScript float arithmetic ever touches a balance.
export const task = pgTable('task', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  instruction: text('instruction').notNull(),
  taskType: text('taskType').notNull().default('text'),
  operation: text('operation').notNull().default('infer'),
  mediaSpec: jsonb('mediaSpec').$type<import('../venus/media').MediaSpec | null>(),
  itemCount: integer('itemCount').notNull(),
  concurrency: integer('concurrency').notNull(),
  unitPrice: numeric('unitPrice', { precision: 18, scale: 4 }).notNull(),
  reservedAmount: numeric('reservedAmount', { precision: 18, scale: 4 }).notNull(),
  currency: text('currency').notNull().default('VTEST'),
  status: text('status').notNull().default('pending_nodes'),
  nodeId: text('nodeId'),
  nodeName: text('nodeName'),
  model: text('model'),
  consentedAt: timestamp('consentedAt'),
  requestKey: text('requestKey').unique(),
  requestHash: text('requestHash'),
  settlementStatus: text('settlementStatus').notNull().default('unverified'),
  settledAt: timestamp('settledAt'),
  cancelRequested: boolean('cancelRequested').notNull().default(false),
  maxOutputTokens: integer('maxOutputTokens').notNull().default(1024),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const taskItem = pgTable('task_item', {
  id: text('id').primaryKey(),
  taskId: text('taskId').notNull(),
  userId: text('userId').notNull(),
  idx: integer('idx').notNull(),
  text: text('text').notNull(),
  billingUnits: integer('billingUnits').notNull().default(1),
  status: text('status').notNull().default('pending'),
  attemptId: text('attemptId').unique(),
  nodeId: text('nodeId'),
  claimKey: text('claimKey').unique(),
  fence: integer('fence').notNull().default(0),
  leaseExpiresAt: timestamp('leaseExpiresAt'),
  startedAt: timestamp('startedAt'),
  finishedAt: timestamp('finishedAt'),
  result: text('result'),
  resultMeta: jsonb('resultMeta').$type<Record<string, unknown> | null>(),
  usage: jsonb('usage').$type<{ inputTokens: number; outputTokens: number } | null>(),
  errorCode: text('errorCode'),
  resultHash: text('resultHash'),
  watcherRunId: text('watcherRunId'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const wallet = pgTable('wallet', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().unique(),
  currency: text('currency').notNull().default('VTEST'),
  spendingAvailable: numeric('spendingAvailable', { precision: 18, scale: 4 }).notNull().default('0'),
  spendingReserved: numeric('spendingReserved', { precision: 18, scale: 4 }).notNull().default('0'),
  earningEscrowed: numeric('earningEscrowed', { precision: 18, scale: 4 }).notNull().default('0'),
  earningAvailable: numeric('earningAvailable', { precision: 18, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const ledgerEntry = pgTable('ledger_entry', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  kind: text('kind').notNull(),
  account: text('account').notNull(),
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  balanceAfter: numeric('balanceAfter', { precision: 18, scale: 4 }).notNull(),
  taskId: text('taskId'),
  businessKey: text('businessKey').unique(),
  description: text('description').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

// Node identity and credentials. Only hashes of pairing codes and node tokens
// are stored — never the plaintext secret. Every row is scoped by userId.
export const node = pgTable('node', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  platform: text('platform').notNull(),
  status: text('status').notNull().default('enrolled'),
  resourcePolicy: jsonb('resourcePolicy').$type<import('../../packages/node-protocol').ResourcePolicy>(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const nodeIdentity = pgTable('node_identity', {
  id: text('id').primaryKey(),
  nodeId: text('nodeId').notNull(),
  userId: text('userId').notNull(),
  tokenHash: text('tokenHash').notNull().unique(),
  revoked: boolean('revoked').notNull().default(false),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const enrollmentIntent = pgTable('enrollment_intent', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  codeHash: text('codeHash').notNull().unique(),
  platform: text('platform').notNull(),
  nodeName: text('nodeName').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  consumedAt: timestamp('consumedAt'),
  nodeId: text('nodeId'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const nodeHeartbeat = pgTable('node_heartbeat', {
  id: text('id').primaryKey(),
  nodeId: text('nodeId').notNull().unique(),
  userId: text('userId').notNull(),
  lastSeenAt: timestamp('lastSeenAt').notNull().defaultNow(),
  cpu: numeric('cpu', { precision: 5, scale: 2 }),
  vram: integer('vram'),
  models: jsonb('models').$type<string[]>(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const apiToken = pgTable('api_token', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  tokenHash: text('tokenHash').notNull().unique(),
  scope: text('scope').notNull().default('read_draft'),
  lastUsedAt: timestamp('lastUsedAt'),
  revoked: boolean('revoked').notNull().default(false),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})
