import { NextResponse } from 'next/server'
import { resolveApiToken } from '@/lib/venus/nodes'
import { listNodes } from '@/lib/venus/nodes'
import { getWallet } from '@/lib/venus/ledger'
import { prepareTaskDraft } from '@/lib/venus/task-draft'
import { UNIT_PRICE, formatDisplay, multiplyStr } from '@/lib/venus/money'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Platform MCP over Streamable HTTP (JSON-RPC 2.0). Every tool is scoped to the
// token's user and is strictly read-or-draft: no tool submits a task, reserves
// budget, moves money, or bypasses the human confirmation that task creation
// requires in the app. Spend always needs an explicit action by the signed-in
// user, never an MCP call.
const TOOLS = [
  {
    name: 'venus_discover_capabilities',
    description: "List the caller's own online nodes and the model capabilities they currently report. Returns an empty list until a node is connected and verified.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'venus_prepare_task_draft',
    description: 'Split text into per-line records and return an unsubmitted, unauthorized draft with a server-computed test price estimate. Does not submit, reserve budget, or execute anything.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'What to do with each record.' },
        content: { type: 'string', description: 'Text with one record per line.' },
        concurrency: { type: 'integer', minimum: 1, maximum: 8 },
      },
      required: ['instruction', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'venus_get_test_billing',
    description: "Return the caller's test-ledger balances (non-withdrawable test funds).",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null
}

function rpc(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { headers: { 'Cache-Control': 'no-store' } })
}
function rpcError(id: unknown, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } })
}
function toolText(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

async function callTool(name: string, args: Record<string, unknown>, userId: string) {
  if (name === 'venus_discover_capabilities') {
    const nodes = (await listNodes(userId)).filter((n) => n.online)
    return toolText({
      nodes: nodes.map((n) => ({ id: n.id, name: n.name, platform: n.platform, models: n.models })),
      note: nodes.length === 0 ? 'No online, verified nodes yet. Capabilities appear only after a node connects.' : undefined,
    })
  }
  if (name === 'venus_get_test_billing') {
    const wallet = await getWallet(userId)
    return toolText({ ...wallet, withdrawable: false, note: 'Test ledger only. Funds cannot be withdrawn.' })
  }
  if (name === 'venus_prepare_task_draft') {
    const prepared = prepareTaskDraft({
      instruction: String(args.instruction ?? ''),
      content: String(args.content ?? ''),
      concurrency: typeof args.concurrency === 'number' ? args.concurrency : 1,
    })
    if (!prepared.ok) return { ...toolText({ ok: false, error: prepared.error }), isError: true }
    const priceEstimate = multiplyStr(UNIT_PRICE, prepared.draft.items.length)
    return toolText({
      ok: true,
      status: 'unsubmitted_draft',
      authorized: false,
      instruction: prepared.draft.instruction,
      recordCount: prepared.draft.items.length,
      concurrency: prepared.draft.concurrency,
      testPriceEstimate: `${formatDisplay(priceEstimate)} VTEST`,
      note: 'Draft only. Submitting and reserving test budget requires an explicit action by the signed-in user in the Venus app.',
    })
  }
  return null
}

export async function POST(request: Request) {
  const token = bearer(request)
  const auth = token ? await resolveApiToken(token) : null
  if (!auth) return rpcError(null, -32001, 'Unauthorized', 401)

  let body: { id?: unknown; method?: string; params?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return rpcError(null, -32700, 'Parse error', 400)
  }
  const { id = null, method, params = {} } = body

  if (method === 'initialize') {
    return rpc(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'venus-platform-mcp', version: '0.1.0' },
    })
  }
  if (method === 'tools/list') return rpc(id, { tools: TOOLS })
  if (method === 'tools/call') {
    const name = String((params as Record<string, unknown>).name ?? '')
    const args = ((params as Record<string, unknown>).arguments as Record<string, unknown>) ?? {}
    if (!TOOLS.some((tool) => tool.name === name)) return rpcError(id, -32602, `Unknown tool: ${name}`)
    try {
      const result = await callTool(name, args, auth.userId)
      if (!result) return rpcError(id, -32602, `Unknown tool: ${name}`)
      return rpc(id, result)
    } catch {
      return rpcError(id, -32603, 'Internal error')
    }
  }
  if (method === 'notifications/initialized') return new NextResponse(null, { status: 204 })
  return rpcError(id, -32601, `Method not found: ${method ?? ''}`)
}
