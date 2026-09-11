'use client'

import { useState } from 'react'
import { Plus, Server, ArrowUpRight, Terminal, GitBranch, ShieldCheck, Cable, Braces, Copy, Check, RefreshCw, Globe2, Download, LockKeyhole, Loader2, Trash2, Pause, Play, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { useWorkspace } from './workspace-context'
import { PageHeading } from './workspace'
import { useApiTokens, useNodeRelease, useNodes } from '@/lib/venus/use-workspace-data'
import { createApiToken, generateEnrollmentCode, revokeApiToken, setNodeStatus } from '@/app/actions/nodes'
import type { NodeView } from '@/lib/venus/nodes'
import { cn } from '@/lib/utils'
import { NodePolicyForm } from './node-policy-form'

export const repository = 'https://github.com/alanmao1984/littleyellowwhale'
export type NodeOperatingSystem = 'windows' | 'macos'

export function NodeInstallerDownloads({ platform }: { platform: NodeOperatingSystem }) {
  const { t } = useWorkspace()
  const { release, releaseError, releaseLoading } = useNodeRelease()
  const choices = platform === 'windows'
    ? [{ key: 'windows' as const, label: t('下载 Windows x64 安装程序', 'Download for Windows x64') }]
    : [
        { key: 'macos-arm64' as const, label: t('下载 Apple Silicon 版', 'Download for Apple Silicon') },
        { key: 'macos-x64' as const, label: t('下载 Intel Mac 版', 'Download for Intel Mac') },
      ]
  const available = choices.some(choice => release?.platforms[choice.key].available)
  const status = releaseLoading
    ? t('正在检查正式版本', 'Checking the verified release')
    : releaseError
      ? t('暂时无法检查安装包', 'Installer status unavailable')
      : available
        ? t(`正式签名版 v${release?.version}`, `Verified release v${release?.version}`)
        : t('正式安装包准备中', 'Verified installers are being prepared')
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-secondary p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Download className="size-4" /><span className="text-sm font-medium">{t('节点安装程序', 'Node installer')}</span></div>
        <Badge variant={available ? 'secondary' : 'outline'}>{status}</Badge>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {choices.map(choice => release?.platforms[choice.key].available
          ? <a key={choice.key} href={`/api/downloads/node/${choice.key}`} className={cn(buttonVariants(), 'w-full sm:w-auto')}><Download className="size-4" />{choice.label}</a>
          : <Button key={choice.key} disabled className="w-full sm:w-auto">{releaseLoading ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}{choice.label}</Button>)}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('浏览器只会开始下载。系统仍会要求你确认安装；程序不会注册后台服务、自动下载模型或修改防火墙。', 'The browser only starts the download. Your system still asks you to approve installation. The app does not register a background service, download models, or change your firewall.')}</p>
    </div>
  )
}

function EnrollmentFlow({ onCreated }: { onCreated: () => void }) {
  const { t } = useWorkspace()
  const [platform, setPlatform] = useState<NodeOperatingSystem>('windows')
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)
  async function generate() {
    setPending(true)
    try {
      const result = await generateEnrollmentCode({ platform, nodeName: name })
      if (result.ok) { setIssued({ code: result.code, expiresAt: result.expiresAt }); setName(''); onCreated() }
      else toast.error(t('无法生成配对码，请检查输入。', 'Could not generate a pairing code.'))
    } catch { toast.error(t('生成失败，请稍后再试。', 'Failed. Please try again.')) }
    finally { setPending(false) }
  }
  async function copyCode() {
    if (!issued) return
    try { await navigator.clipboard.writeText(issued.code); setCopied(true); toast.success(t('已复制配对码', 'Pairing code copied')) }
    catch { toast.error(t('复制失败，请手动复制。', 'Copy failed. Copy manually.')) }
  }
  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-background p-5">
      <Tabs value={platform} onValueChange={(value) => { setPlatform(value as NodeOperatingSystem); setIssued(null) }}><TabsList><TabsTrigger value="windows">Windows</TabsTrigger><TabsTrigger value="macos">macOS</TabsTrigger></TabsList></Tabs>
      <ol className="grid gap-4 md:grid-cols-3">
        {[
          [t('下载安装程序', 'Download the installer'), t('选择设备架构，下载后由系统确认安装。', 'Choose your device architecture, then approve installation in your system.')],
          [t('启动并本机授权', 'Launch and approve locally'), t('打开 Venus Node，确认本机服务、模型和资源边界。', 'Open Venus Node and approve the local service, models, and resource boundaries.')],
          [t('输入一次性配对码', 'Enter a one-time code'), t('在下方生成配对码，并输入到前台节点程序。', 'Generate a code below and enter it in the foreground node app.')],
        ].map(([title, detail], index) => <li key={title} className="flex items-start gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-sm">{index + 1}</span><div><h3 className="text-sm font-medium">{title}</h3><p className="pt-1 text-sm leading-relaxed text-muted-foreground">{detail}</p></div></li>)}
      </ol>
      <NodeInstallerDownloads platform={platform} />
      <div className="flex flex-wrap items-end gap-3 border-t pt-5">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('节点名称（可选）', 'Node name (optional)')} maxLength={60} className="w-48" aria-label={t('节点名称', 'Node name')} />
        <Button onClick={generate} disabled={pending}>{pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Plus data-icon="inline-start" />}{t('生成配对码', 'Generate pairing code')}</Button>
      </div>
      {issued && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-secondary p-4">
          <div className="flex items-center justify-between gap-3">
            <code className="font-mono text-xl tracking-widest">{issued.code}</code>
            <Button variant="outline" size="sm" onClick={copyCode}>{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{t('复制', 'Copy')}</Button>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{t(`一次性配对码，${new Date(issued.expiresAt).toLocaleTimeString('zh-CN')} 前有效。交给已授权的节点程序完成绑定；平台只保存其哈希，不会再次显示。`, `One-time code, valid until ${new Date(issued.expiresAt).toLocaleTimeString('en-US')}. Give it to your authorized node runtime. Only its hash is stored and it will not be shown again.`)}</p>
        </div>
      )}
    </div>
  )
}

function NodeRow({ node, onChanged }: { node: NodeView; onChanged: () => void }) {
  const { t, locale } = useWorkspace()
  const [pending, setPending] = useState(false)
  async function apply(status: 'paused' | 'enrolled' | 'revoked') {
    setPending(true)
    try {
      const result = await setNodeStatus(node.id, status)
      if (result.ok) { onChanged(); toast.success(status === 'revoked' ? t('节点已撤销', 'Node revoked') : status === 'paused' ? t('已暂停接单', 'Paused') : t('已恢复接单', 'Resumed')) }
      else toast.error(t('操作失败。', 'Action failed.'))
    } catch { toast.error(t('操作失败，请稍后再试。', 'Action failed. Please try again.')) }
    finally { setPending(false) }
  }
  const online = node.online
  return (
    <li className="flex flex-col gap-3 p-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('size-2 rounded-full', online ? 'bg-primary' : 'bg-muted-foreground')} aria-hidden />
          <span className="font-medium">{node.name}</span>
          <Badge variant="outline">{node.platform === 'windows' ? 'Windows' : 'macOS'}</Badge>
          <Badge variant={node.status === 'revoked' ? 'secondary' : 'outline'}>{node.status === 'revoked' ? t('已撤销', 'Revoked') : node.status === 'paused' ? t('已暂停', 'Paused') : online ? t('在线', 'Online') : t('离线', 'Offline')}</Badge>
        </div>
        <p className="pt-2 text-sm text-muted-foreground">
          {node.lastSeenAt ? t(`最近心跳 ${new Date(node.lastSeenAt).toLocaleString('zh-CN')}`, `Last heartbeat ${new Date(node.lastSeenAt).toLocaleString('en-US')}`) : t('尚未收到心跳', 'No heartbeat yet')}
          {node.models.length > 0 && ` · ${node.models.slice(0, 3).join(', ')}`}
          {node.cpu && ` · CPU ${node.cpu}%`}
          {typeof node.vram === 'number' && ` · VRAM ${node.vram}MB`}
        </p>
      </div>
      {node.status !== 'revoked' && (
        <div className="flex shrink-0 flex-wrap gap-2">
          <NodePolicyForm node={node} onChanged={onChanged} />
          {node.status === 'paused'
            ? <Button variant="outline" size="sm" onClick={() => apply('enrolled')} disabled={pending}><Play data-icon="inline-start" />{t('恢复', 'Resume')}</Button>
            : <Button variant="outline" size="sm" onClick={() => apply('paused')} disabled={pending}><Pause data-icon="inline-start" />{t('暂停', 'Pause')}</Button>}
          <Button variant="outline" size="sm" onClick={() => apply('revoked')} disabled={pending}><Trash2 data-icon="inline-start" />{t('撤销', 'Revoke')}</Button>
        </div>
      )}
    </li>
  )
}

export function NodesPanel() {
  const { t, setModal, user, locale } = useWorkspace()
  const { nodes, enrollments, nodesLoading, refreshNodes } = useNodes(!!user)
  return <div className="content-enter"><PageHeading title={t('我的节点', 'My nodes')} subtitle={t('你的设备，你的规则。让闲置算力参与协作。', 'Your devices. Your rules. Put idle power to work.')} action={<Button variant="outline" onClick={() => setModal('connect')}><Braces data-icon="inline-start" />{t('接入指南', 'Setup guide')}</Button>} />
    {!user
      ? <section className="panel"><Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><Server /></EmptyMedia><EmptyTitle>{t('第一台设备，从你开始', 'Your first device starts with you')}</EmptyTitle><EmptyDescription>{t('登录后即可生成一次性配对码，把已授权的节点程序安全绑定到你的账户。真实在线状态由设备心跳决定。', 'Sign in to generate a one-time pairing code and bind your authorized node runtime. Online status comes from real device heartbeats.')}</EmptyDescription></EmptyHeader><a href="/sign-in" className="text-sm font-medium underline underline-offset-4">{t('登录', 'Sign in')}</a></Empty></section>
      : <div className="flex flex-col gap-6">
          <div><h2 className="section-heading pb-3">{t('绑定新节点', 'Pair a new node')}</h2><EnrollmentFlow onCreated={() => void refreshNodes()} />{enrollments && enrollments.length > 0 && <p className="pt-3 text-sm text-muted-foreground">{t(`${enrollments.length} 个待使用的配对码 · 15 分钟内有效`, `${enrollments.length} pairing code(s) awaiting use · valid for 15 minutes`)}</p>}</div>
          <section className="panel"><div className="flex items-center justify-between border-b px-5 py-4"><h2 className="section-heading">{t('我的设备', 'My devices')}</h2><Button variant="ghost" size="icon" onClick={() => void refreshNodes()} aria-label={t('刷新节点', 'Refresh nodes')}><RefreshCw /></Button></div>
            {nodesLoading && !nodes
              ? <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />{t('正在加载节点…', 'Loading nodes…')}</div>
              : (nodes?.length ?? 0) === 0
                ? <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><Server /></EmptyMedia><EmptyTitle>{t('还没有绑定设备', 'No devices paired yet')}</EmptyTitle><EmptyDescription>{t('生成配对码并在已授权的节点程序中完成绑定，设备就会出现在这里。', 'Generate a pairing code and complete binding in your authorized node runtime.')}</EmptyDescription></EmptyHeader></Empty>
                : <ul className="divide-y">{nodes!.map((node) => <NodeRow key={node.id} node={node} onChanged={() => void refreshNodes()} />)}</ul>}
          </section>
        </div>}
    <div className="mt-5 flex items-start gap-3 text-sm text-muted-foreground"><ShieldCheck className="size-4 shrink-0" /><p className="leading-relaxed">{t('节点需要开机、联网并运行节点程序。浏览器不会直接访问你的显卡，也不会自动开启后台服务。配对码只关联绑定请求，不是长期凭据；节点凭据仅返回一次并只保存哈希。', 'Nodes must be powered on, connected and running the node runtime. Your browser cannot access your GPU or start background services. The pairing code only links a request; node credentials are returned once and only their hash is stored.')}</p></div></div>
}

function TokenManager() {
  const { t } = useWorkspace()
  const { tokens, tokensLoading, refreshTokens } = useApiTokens(true)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  async function create() {
    setPending(true)
    try {
      const result = await createApiToken(name)
      setIssued(result.token); setName(''); setCopied(false); void refreshTokens()
      toast.success(t('已生成一次性令牌，请立即复制保存', 'Token generated. Copy and store it now.'))
    } catch { toast.error(t('生成失败，请稍后再试。', 'Failed. Please try again.')) }
    finally { setPending(false) }
  }
  async function revoke(id: string) {
    try { const result = await revokeApiToken(id); if (result.ok) { void refreshTokens(); toast.success(t('令牌已撤销', 'Token revoked')) } }
    catch { toast.error(t('撤销失败，请稍后再试。', 'Revoke failed. Please try again.')) }
  }
  async function copyToken() {
    if (!issued) return
    try { await navigator.clipboard.writeText(issued); setCopied(true) } catch { toast.error(t('复制失败，请手动复制。', 'Copy failed. Copy manually.')) }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('令牌名称（可选）', 'Token name (optional)')} maxLength={60} className="w-56" aria-label={t('令牌名称', 'Token name')} />
        <Button onClick={create} disabled={pending}>{pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <KeyRound data-icon="inline-start" />}{t('生成限权令牌', 'Create scoped token')}</Button>
      </div>
      {issued && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-secondary p-4">
          <div className="flex items-center justify-between gap-3"><code className="min-w-0 truncate font-mono text-sm">{issued}</code><Button variant="outline" size="sm" onClick={copyToken}>{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{t('复制', 'Copy')}</Button></div>
          <p className="text-sm leading-relaxed text-muted-foreground">{t('作用域 read_draft：只能读取你自己的数据并生成草稿，不能提交任务、动用预算或提升权限。令牌只显示这一次，平台只保存哈希。', 'Scope read_draft: reads only your own data and prepares drafts. It cannot submit tasks, move budget, or escalate. Shown once; only its hash is stored.')}</p>
        </div>
      )}
      {tokensLoading && !tokens
        ? <div className="flex min-h-16 items-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />{t('正在加载令牌…', 'Loading tokens…')}</div>
        : (tokens?.length ?? 0) === 0
          ? <p className="text-sm text-muted-foreground">{t('还没有令牌。生成后可用于 MCP 客户端连接。', 'No tokens yet. Create one to connect an MCP client.')}</p>
          : <ul className="divide-y rounded-lg border">{tokens!.map((token) => <li key={token.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{token.name}</p><p className="pt-0.5 text-sm text-muted-foreground">{token.scope} · {token.lastUsedAt ? t(`最近使用 ${new Date(token.lastUsedAt).toLocaleString('zh-CN')}`, `used ${new Date(token.lastUsedAt).toLocaleDateString('en-US')}`) : t('未使用', 'unused')}</p></div><Button variant="outline" size="sm" onClick={() => revoke(token.id)}><Trash2 data-icon="inline-start" />{t('撤销', 'Revoke')}</Button></li>)}</ul>}
    </div>
  )
}

export function DevelopersPanel() {
  const { t, user } = useWorkspace()
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const endpoint = `${origin}/api/mcp`
  return <div className="content-enter"><PageHeading title={t('开发者 / MCP', 'Developers / MCP')} subtitle={t('让 AI 助手成为入口，让节点程序负责执行。', 'An AI assistant as the entry point. A node runtime for execution.')} action={<a href={repository} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline' })}><GitBranch className="size-4" />GitHub<ArrowUpRight className="size-4" /></a>} />
    <div className="panel p-6"><Badge variant="secondary">{t('平台 MCP 已上线 · 只读 / 草稿', 'Platform MCP live · read / draft')}</Badge><h2 className="pb-3 pt-4 text-xl font-semibold">{t('一个标准入口，两种协作方式', 'One standard interface. Two ways to collaborate.')}</h2><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t('平台 MCP 已提供只读与草稿工具：发现你自己的在线节点能力、生成经校验的未提交草稿、查询测试账单。任何提交任务或动用预算的操作仍需登录用户在应用内明确确认，不经 MCP。本机 stdio MCP 与授权提交仍在开发。', 'The platform MCP now exposes read/draft tools: discover your own online node capabilities, prepare validated unsubmitted drafts, and read test billing. Submitting a task or moving budget still requires explicit confirmation by the signed-in user in the app — never via MCP. Local stdio MCP and authorized submission are still in development.')}</p><div className="grid gap-4 pt-6 md:grid-cols-2">{[['平台 MCP', 'Platform MCP', 'Streamable HTTP', '发现能力、生成草稿、查询测试账单（read_draft）。', 'Discover capabilities, prepare drafts, read test billing (read_draft).', true], ['本机 MCP', 'Local MCP', 'stdio', '本机检测、绑定申请、资源策略、暂停接单。', 'Local inspection, pairing, resource policies and pausing.', false]].map(([zh, en, transport, descZh, descEn, live]) => <div key={String(en)} className="rounded-lg border bg-background p-5"><div className="flex items-center justify-between gap-2"><h3 className="font-medium">{t(String(zh), String(en))}</h3><Badge variant={live ? 'secondary' : 'outline'}>{live ? t('已上线', 'Live') : t('开发中', 'Planned')}</Badge></div><code className="font-mono text-sm text-muted-foreground">{String(transport)}</code><p className="pt-3 text-sm leading-relaxed text-muted-foreground">{t(String(descZh), String(descEn))}</p></div>)}</div></div>
    <section className="panel mt-6"><div className="flex items-center justify-between border-b p-5"><h2 className="section-heading">{t('连接配置与访问凭据', 'Connection settings & credentials')}</h2><LockKeyhole className="size-4 text-muted-foreground" /></div>
      {!user
        ? <Empty><EmptyHeader><EmptyMedia variant="icon"><Cable /></EmptyMedia><EmptyTitle>{t('安全连接，从明确授权开始', 'A secure connection starts with consent')}</EmptyTitle><EmptyDescription>{t('登录后可生成限权、可撤销的一次性令牌，用于将支持自定义认证的 MCP 客户端连接到平台 MCP。', 'Sign in to create scoped, revocable one-time tokens for MCP clients that support custom authentication.')}</EmptyDescription></EmptyHeader><a href="/sign-in" className="text-sm font-medium underline underline-offset-4">{t('登录', 'Sign in')}</a></Empty>
        : <div className="flex flex-col gap-5 p-5"><div className="rounded-lg border bg-background p-4"><div className="flex items-center gap-2 text-sm"><Cable className="size-4" /><span className="font-medium">{t('平台 MCP 端点', 'Platform MCP endpoint')}</span></div><code className="mt-2 block break-all font-mono text-sm text-muted-foreground">POST {endpoint}</code><p className="pt-2 text-sm leading-relaxed text-muted-foreground">{t('JSON-RPC 2.0（Streamable HTTP）。在 Authorization 头携带 Bearer 令牌。仅对支持自定义认证头的客户端使用；标准 OAuth 连接器需另行实现，尚未提供。', 'JSON-RPC 2.0 (Streamable HTTP). Pass the token as an Authorization Bearer header. For clients supporting custom auth headers only; a standard OAuth connector is not implemented yet.')}</p></div><TokenManager /></div>}
    </section>
  </div>
}

export function SettingsPanel() {
  const { t, locale, setLocale, setModal, status, statusError, refreshStatus } = useWorkspace()
  return <div className="content-enter"><PageHeading title={t('设置', 'Settings')} subtitle={t('管理偏好，了解工作空间的真实状态。', 'Manage your preferences and review the actual workspace status.')} />
    <div className="flex flex-col gap-5"><section className="panel"><div className="border-b px-6 py-4"><h2 className="section-heading">{t('工作空间状态', 'Workspace status')}</h2></div><div className="divide-y divide-border px-6"><div className="flex flex-wrap items-center justify-between gap-3 py-5"><div><h3 className="text-sm font-medium">Neon PostgreSQL</h3><p className="pt-1 text-sm text-muted-foreground">{t('由服务器执行实际连接检查，不读取个人数据。', 'A real server-side connection check. No personal data is read.')}</p></div><div className="flex items-center gap-2"><Badge variant={status?.database === 'connected' ? 'secondary' : 'outline'}>{statusError ? t('检测不可用', 'Check unavailable') : !status ? t('正在检测', 'Checking') : status.database === 'connected' ? t('连接正常', 'Connected') : status.database === 'pending' ? t('环境配置待就绪', 'Configuration pending') : t('暂时不可用', 'Unavailable')}</Badge><Button variant="ghost" size="icon" onClick={refreshStatus} aria-label={t('重新检查数据库', 'Recheck database')}><RefreshCw /></Button></div></div><div className="flex flex-wrap items-center justify-between gap-3 py-5"><div><h3 className="text-sm font-medium">{t('账户与登录', 'Accounts & authentication')}</h3><p className="pt-1 text-sm text-muted-foreground">{t('Better Auth 邮箱密码登录，每用户数据隔离与服务端会话校验。', 'Better Auth email and password login, with per-user data isolation and server-side session checks.')}</p></div><Badge variant={status?.authentication === 'ready' ? 'secondary' : 'outline'}>{statusError ? t('检测不可用', 'Check unavailable') : status?.authentication === 'ready' ? t('已就绪', 'Ready') : t('待就绪', 'Pending')}</Badge></div><div className="flex flex-wrap items-center justify-between gap-3 py-5"><div><h3 className="text-sm font-medium">{t('节点协议与安装包', 'Node protocol & installers')}</h3><p className="pt-1 text-sm text-muted-foreground">{t('配对、限权凭据与心跳协议已就绪；Windows / macOS 安装包通过公开 Release 分发，节点仅以前台终端运行。', 'Pairing, scoped credentials, and heartbeat are ready. Windows and macOS installers are distributed through public Releases, and the node runs only in a foreground terminal.')}</p></div><Badge variant="outline">{t('协议就绪 · 真机待验证', 'Protocol ready · devices unverified')}</Badge></div></div></section>
    <section className="panel"><div className="border-b px-6 py-4"><h2 className="section-heading">{t('偏好设置', 'Preferences')}</h2></div><div className="divide-y divide-border px-6"><div className="flex flex-wrap items-center justify-between gap-4 py-5"><div><h3 className="flex items-center gap-2 text-sm font-medium"><Globe2 className="size-4" />{t('显示语言', 'Display language')}</h3><p className="pt-1 text-sm text-muted-foreground">{t('保存在浏览器偏好 Cookie 中，不存储任务内容。', 'Saved as a preference cookie. No task content is stored.')}</p></div><Tabs value={locale} onValueChange={value => setLocale(value as 'zh' | 'en')}><TabsList><TabsTrigger value="zh">中文</TabsTrigger><TabsTrigger value="en">English</TabsTrigger></TabsList></Tabs></div><div className="flex flex-wrap items-center justify-between gap-4 py-5"><div><h3 className="text-sm font-medium">{t('添加到主屏幕', 'Add to your home screen')}</h3><p className="pt-1 text-sm text-muted-foreground">{t('安装 Web 应用，随时打开工作台。', 'Install the web app for quick access to your workspace.')}</p></div><Button variant="outline" onClick={() => setModal('install')}><Download data-icon="inline-start" />{t('安装指南', 'Install guide')}</Button></div></div></section>
    <section className="panel p-6"><h2 className="section-heading">{t('源码与交付', 'Source & delivery')}</h2><p className="pb-4 pt-2 text-sm leading-relaxed text-muted-foreground">{t('以下为指定的交付仓库，尚未推送或创建 Release。开发与验证完成后，将再次确认授权与远程历史。', 'This is the designated delivery repository. No code has been pushed or releases created. Authorization and remote history will be checked before delivery.')}</p><a href={repository} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 break-all font-mono text-sm underline-offset-4 hover:underline"><GitBranch className="size-4 shrink-0" />alanmao1984/littleyellowwhale<ArrowUpRight className="size-4 shrink-0" /></a></section></div>
  </div>
}
