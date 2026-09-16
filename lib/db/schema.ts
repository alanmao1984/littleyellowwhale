import { bigint, boolean, integer, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

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
  organizationId: text('organizationId'),
  departmentId: text('departmentId'),
  costCenterId: text('costCenterId'),
  dispatchDomain: text('dispatchDomain').notNull().default('self'),
  offeringId: text('offeringId'),
  apiRequestId: text('apiRequestId'),
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
  usageVerified: boolean('usageVerified').notNull().default(false),
  usageAuditHash: text('usageAuditHash'),
  errorCode: text('errorCode'),
  resultHash: text('resultHash'),
  watcherRunId: text('watcherRunId'),
  watcherClaimId: text('watcherClaimId'),
  watcherClaimUntil: timestamp('watcherClaimUntil', { withTimezone: true }),
  reviewDecision: text('reviewDecision'),
  reviewedBy: text('reviewedBy'),
  reviewedAt: timestamp('reviewedAt', { withTimezone: true }),
  reviewReason: text('reviewReason'),
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
  organizationId: text('organizationId'),
  departmentId: text('departmentId'),
  dispatchDomain: text('dispatchDomain').notNull().default('self'),
  visibility: text('visibility').notNull().default('private'),
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
  capabilities: jsonb('capabilities').$type<import('../../packages/node-protocol').Capability[]>().notNull().default(['text:infer']),
  hardware: jsonb('hardware').$type<import('../../packages/node-protocol').HardwareProfile>(),
  hermes: jsonb('hermes').$type<import('../../packages/node-protocol').HermesStatus>(),
  attestationPublicKey: text('attestationPublicKey'),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const nodeUsageEvent = pgTable('node_usage_events', {
  id: text('id').primaryKey(), attemptId: text('attemptId').notNull().unique(), nodeId: text('nodeId').notNull(), userId: text('userId').notNull(), taskId: text('taskId').notNull(),
  eventHash: text('eventHash').notNull(), inputHash: text('inputHash').notNull(), outputHash: text('outputHash'), usage: jsonb('usage').$type<{ inputTokens: number; outputTokens: number } | null>(), signature: text('signature'),
  verified: boolean('verified').notNull().default(false), reason: text('reason'), createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const hermesAccessGrant = pgTable('hermes_access_grants', {
  id: text('id').primaryKey(), nodeId: text('nodeId').notNull(), userId: text('userId').notNull(), codeHash: text('codeHash').notNull().unique(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(), consumedAt: timestamp('consumedAt', { withTimezone: true }), createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const taskSettlement = pgTable('task_settlement', {
  id: text('id').primaryKey(),
  taskId: text('taskId').notNull().unique(),
  userId: text('userId').notNull(),
  currency: text('currency').notNull().default('VTEST'),
  originalAmount: numeric('originalAmount', { precision: 18, scale: 4 }).notNull(),
  acceptedAmount: numeric('acceptedAmount', { precision: 18, scale: 4 }).notNull(),
  refundedAmount: numeric('refundedAmount', { precision: 18, scale: 4 }).notNull(),
  providerAmount: numeric('providerAmount', { precision: 18, scale: 4 }).notNull(),
  brokerAmount: numeric('brokerAmount', { precision: 18, scale: 4 }).notNull(),
  platformAmount: numeric('platformAmount', { precision: 18, scale: 4 }).notNull(),
  status: text('status').notNull().default('escrowed'),
  settledAt: timestamp('settledAt', { withTimezone: true }).notNull().defaultNow(),
  releaseAt: timestamp('releaseAt', { withTimezone: true }).notNull(),
  releasedAt: timestamp('releasedAt', { withTimezone: true }),
  releaseRunId: text('releaseRunId'),
  releaseClaimId: text('releaseClaimId'),
  releaseClaimUntil: timestamp('releaseClaimUntil', { withTimezone: true }),
})

export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('lastRequest', { mode: 'number' }).notNull(),
})

export const apiToken = pgTable('api_token', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  tokenHash: text('tokenHash').notNull().unique(),
  scope: text('scope').notNull().default('read_draft'),
  organizationId: text('organizationId'),
  expiresAt: timestamp('expiresAt', { withTimezone: true }),
  lastUsedAt: timestamp('lastUsedAt'),
  revoked: boolean('revoked').notNull().default(false),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const organization = pgTable('organizations', {
  id: text('id').primaryKey(),
  ownerId: text('ownerId').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  type: text('type').notNull(),
  status: text('status').notNull().default('active'),
  policy: jsonb('policy').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const organizationMember = pgTable('organization_members', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull(),
  userId: text('userId').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const organizationInvite = pgTable('organization_invites', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull(),
  tokenHash: text('tokenHash').notNull().unique(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('acceptedAt', { withTimezone: true }),
  revokedAt: timestamp('revokedAt', { withTimezone: true }),
  invitedBy: text('invitedBy').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const department = pgTable('departments', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull(),
  name: text('name').notNull(),
  parentId: text('parentId'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const departmentMember = pgTable('department_members', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull(),
  departmentId: text('departmentId').notNull(),
  userId: text('userId').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const costCenter = pgTable('cost_centers', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull(),
  departmentId: text('departmentId'),
  code: text('code').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const organizationQuota = pgTable('organization_quotas', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull(),
  departmentId: text('departmentId'),
  costCenterId: text('costCenterId'),
  kind: text('kind').notNull(),
  limitValue: numeric('limit_value', { precision: 18, scale: 4 }).notNull(),
  reservedValue: numeric('reserved_value', { precision: 18, scale: 4 }).notNull().default('0'),
  usedValue: numeric('used_value', { precision: 18, scale: 4 }).notNull().default('0'),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const quotaUsageLedger = pgTable('quota_usage_ledger', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull(),
  userId: text('userId').notNull(),
  quotaId: text('quotaId').notNull(),
  taskId: text('taskId'),
  kind: text('kind').notNull(),
  amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),
  businessKey: text('businessKey').notNull().unique(),
  description: text('description').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const organizationAuditEvent = pgTable('organization_audit_events', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull(),
  actorId: text('actorId').notNull(),
  action: text('action').notNull(),
  targetType: text('targetType').notNull(),
  targetId: text('targetId'),
  requestId: text('requestId'),
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
  source: text('source').notNull().default('web'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const marketOffering = pgTable('market_offerings', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  nodeId: text('nodeId').notNull(),
  organizationId: text('organizationId'),
  modelAlias: text('modelAlias').notNull(),
  providerModel: text('providerModel').notNull(),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
  contextLimit: integer('contextLimit').notNull().default(8192),
  inputUnitPrice: numeric('inputUnitPrice', { precision: 18, scale: 4 }).notNull(),
  outputUnitPrice: numeric('outputUnitPrice', { precision: 18, scale: 4 }).notNull(),
  concurrency: integer('concurrency').notNull().default(1),
  status: text('status').notNull().default('draft'),
  lastHealthyAt: timestamp('lastHealthyAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const apiRequest = pgTable('api_requests', {
  id: text('id').primaryKey(),
  requestId: text('requestId').notNull(),
  userId: text('userId').notNull(),
  apiTokenId: text('apiTokenId').notNull(),
  organizationId: text('organizationId'),
  offeringId: text('offeringId'),
  taskId: text('taskId'),
  model: text('model').notNull(),
  status: text('status').notNull(),
  reservedAmount: numeric('reservedAmount', { precision: 18, scale: 4 }).notNull().default('0'),
  settledAmount: numeric('settledAmount', { precision: 18, scale: 4 }).notNull().default('0'),
  latencyMs: integer('latencyMs'),
  errorCode: text('error_code'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completedAt', { withTimezone: true }),
})

export const usageRecord = pgTable('usage_records', {
  id: text('id').primaryKey(),
  apiRequestId: text('apiRequestId').notNull().unique(),
  userId: text('userId').notNull(),
  providerUserId: text('providerUserId'),
  organizationId: text('organizationId'),
  offeringId: text('offeringId'),
  taskId: text('taskId'),
  inputTokens: integer('inputTokens').notNull().default(0),
  outputTokens: integer('outputTokens').notNull().default(0),
  inputAmount: numeric('inputAmount', { precision: 18, scale: 4 }).notNull().default('0'),
  outputAmount: numeric('outputAmount', { precision: 18, scale: 4 }).notNull().default('0'),
  currency: text('currency').notNull().default('VTEST'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const mediaAsset = pgTable('media_assets', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  organizationId: text('organizationId'),
  taskId: text('taskId'),
  taskItemId: text('taskItemId'),
  nodeId: text('nodeId'),
  kind: text('kind').notNull(),
  pathname: text('pathname').notNull().unique(),
  contentType: text('contentType').notNull(),
  byteSize: bigint('byteSize', { mode: 'number' }).notNull(),
  sha256: text('sha256').notNull(),
  status: text('status').notNull().default('ready'),
  attemptId: text('attemptId'),
  fence: integer('fence'),
  retentionUntil: timestamp('retentionUntil', { withTimezone: true }),
  deletedAt: timestamp('deletedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export const transferToken = pgTable('transfer_tokens', {
  id: text('id').primaryKey(),
  tokenHash: text('tokenHash').notNull().unique(),
  userId: text('userId').notNull(),
  nodeId: text('nodeId').notNull(),
  assetId: text('assetId').notNull(),
  taskId: text('taskId').notNull(),
  attemptId: text('attemptId').notNull(),
  fence: integer('fence').notNull(),
  action: text('action').notNull(),
  maxBytes: bigint('maxBytes', { mode: 'number' }).notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  usedAt: timestamp('usedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

// Platform-operator role, deliberately separate from organization membership so
// no org-level owner/admin/operator/member can ever inherit platform powers. A
// row is granted only by the one-time database script and stays as history when
// revoked (status flips to 'revoked'); it is never physically deleted.
export const platformRole = pgTable('platform_roles', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().unique(),
  role: text('role').notNull(),
  status: text('status').notNull().default('active'),
  grantedBy: text('grantedBy').notNull(),
  grantedReason: text('grantedReason').notNull(),
  grantedAt: timestamp('grantedAt', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revokedAt', { withTimezone: true }),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

// Immutable audit trail for platform-level actions: role grants and every
// create/publish/edit/withdraw of operator content. `summary` holds a redacted
// snapshot only — never prompts, outputs, tokens, or wallet balances.
export const platformAuditEvent = pgTable('platform_audit_events', {
  id: text('id').primaryKey(),
  actorId: text('actorId').notNull(),
  action: text('action').notNull(),
  targetType: text('targetType').notNull(),
  targetId: text('targetId'),
  requestId: text('requestId'),
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

// Explicitly-labelled demonstration activity used only to backfill empty slots
// on the public market feed. It carries public-safe fields only and never
// fabricates real transaction IDs, user identities, or node identities; demo
// rows must never touch wallets, ledgers, usage, or settlement statistics.
export const marketDemoEvent = pgTable('market_demo_events', {
  id: text('id').primaryKey(),
  eventType: text('eventType').notNull().default('text_completion'),
  titleZh: text('titleZh').notNull(),
  titleEn: text('titleEn').notNull(),
  summaryZh: text('summaryZh').notNull(),
  summaryEn: text('summaryEn').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('inputTokens').notNull().default(0),
  outputTokens: integer('outputTokens').notNull().default(0),
  settledAmount: numeric('settledAmount', { precision: 18, scale: 4 }).notNull().default('0'),
  latencyMs: integer('latencyMs'),
  currency: text('currency').notNull().default('VTEST'),
  occurredAt: timestamp('occurredAt', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('draft'),
  createdBy: text('createdBy').notNull(),
  updatedBy: text('updatedBy').notNull(),
  publishedAt: timestamp('publishedAt', { withTimezone: true }),
  withdrawnAt: timestamp('withdrawnAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})
