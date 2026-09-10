'use client'

import { useMemo, useState } from 'react'
import { upload } from '@vercel/blob/client'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Building2, Check, Copy, Cpu, FileVideo2, Globe2, KeyRound, Loader2, Play, Plus, ShieldCheck, Upload, Users } from 'lucide-react'
import { createApiToken } from '@/app/actions/nodes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeading } from './workspace'
import { useWorkspace } from './workspace-context'
import { useNodes } from '@/lib/venus/use-workspace-data'
import { fetchJson, pollingConfig } from '@/lib/venus/request'

const fetcher = fetchJson

type CatalogModel = { id: string; context_limit: number; pricing: { input_per_1k: string; output_per_1k: string; currency: string } }
type Offering = { id: string; modelAlias: string; providerModel: string; status: string; inputUnitPrice: string; outputUnitPrice: string }
type Activity = { id: string; model: string; status: string; reservedAmount: string; settledAmount: string; latencyMs: number | null; inputTokens: number | null; outputTokens: number | null; createdAt: string }
type MarketData = { catalog: CatalogModel[]; owned: Offering[]; activity: Activity[] }

function SignInEmpty({ title, description, icon: Icon }: { title: string; description: string; icon: typeof Globe2 }) {
  return <section className="panel"><Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><Icon /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader><a href="/sign-in" className="text-sm font-medium underline underline-offset-4">登录后继续</a></Empty></section>
}

export function TextMarketPanel() {
  const { user } = useWorkspace()
  const { nodes } = useNodes(!!user)
  const { data, isLoading, mutate } = useSWR<MarketData>(user ? '/api/v1/offerings' : null, fetcher, { ...pollingConfig, refreshInterval: 10000 })
  const availableNodes = (nodes ?? []).filter(node => node.online && node.capabilities.includes('text:infer') && node.models.length)
  const [nodeId, setNodeId] = useState<string | null>(null)
  const selectedNode = availableNodes.find(node => node.id === nodeId) ?? availableNodes[0]
  const [model, setModel] = useState<string | null>(null)
  const providerModel = model && selectedNode?.models.includes(model) ? model : selectedNode?.models[0]
  const [alias, setAlias] = useState('')
  const [inputPrice, setInputPrice] = useState('0.2000')
  const [outputPrice, setOutputPrice] = useState('0.6000')
  const [pending, setPending] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  async function publish() {
    if (!selectedNode || !providerModel || !alias.trim()) return toast.error('请选择节点、模型并填写公开别名。')
    setPending(true)
    try {
      const response = await fetch('/api/v1/offerings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodeId: selectedNode.id, providerModel, modelAlias: alias, contextLimit: 8192, inputUnitPrice: inputPrice, outputUnitPrice: outputPrice, concurrency: 1, organizationId: null }) })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error)
      toast.success('公开 VTEST 供给已发布。'); void mutate()
    } catch { toast.error('发布失败，请检查节点在线状态和定价。') } finally { setPending(false) }
  }
  async function issueToken() {
    setPending(true)
    try { const result = await createApiToken('文本市场调用', 'market:invoke', 30); setIssued(result.token); setCopied(false); toast.success('调用令牌已生成，仅显示一次。') }
    catch { toast.error('令牌生成失败。') } finally { setPending(false) }
  }
  const curl = `curl ${typeof window === 'undefined' ? 'https://your-domain.example' : window.location.origin}/v1/chat/completions \\\n  -H "Authorization: Bearer ${issued ?? 'YOUR_VENUS_TOKEN'}" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Request-Id: demo-${crypto.randomUUID?.() ?? 'request-id'}" \\\n  -d '{"model":"${data?.catalog[0]?.id ?? 'MODEL_ALIAS'}","messages":[{"role":"user","content":"你好"}],"stream":false}'`
  return <div className="content-enter"><PageHeading title="文本 API 市场" subtitle="OpenAI-compatible 非流式调用，跨用户撮合真实节点；仅使用不可提现的 VTEST。" action={<Badge variant="secondary">封闭测试</Badge>} />
    {!user ? <SignInEmpty icon={Globe2} title="登录后进入测试市场" description="模型目录、供给发布、调用令牌和用量记录均来自真实账户数据。" /> : <div className="flex flex-col gap-6">
      <section className="panel"><div className="flex items-center justify-between gap-4 border-b p-5"><div><h2 className="section-heading">可用模型目录</h2><p className="pt-1 text-sm text-muted-foreground">只展示 90 秒内有真实节点心跳的公开供给。</p></div><Badge variant="outline">{data?.catalog.length ?? 0} 个在线模型</Badge></div>
        {isLoading ? <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />正在读取目录…</div> : !data?.catalog.length ? <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><Cpu /></EmptyMedia><EmptyTitle>暂无在线公开供给</EmptyTitle><EmptyDescription>供应方需要让节点保持在线，并显式发布模型能力与 VTEST 测试价格。</EmptyDescription></EmptyHeader></Empty> : <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">{data.catalog.map(item => <Card key={item.id}><CardHeader><CardTitle className="font-mono text-base">{item.id}</CardTitle><CardDescription>上下文上限 {item.context_limit.toLocaleString()} tokens</CardDescription></CardHeader><CardContent><p className="text-sm">输入 {item.pricing.input_per_1k} / 输出 {item.pricing.output_per_1k}</p><p className="pt-1 text-sm text-muted-foreground">VTEST / 1K tokens</p></CardContent></Card>)}</div>}
      </section>
      <div className="grid gap-6 xl:grid-cols-2"><section className="panel p-5"><div className="pb-5"><h2 className="section-heading">发布节点供给</h2><p className="pt-1 text-sm leading-relaxed text-muted-foreground">默认不公开。发布后，匹配调用会把请求正文授权给这台节点处理。</p></div><FieldGroup><Field><FieldLabel>在线节点</FieldLabel><Select value={selectedNode?.id ?? null} onValueChange={value => setNodeId(String(value))}><SelectTrigger className="w-full"><SelectValue placeholder="选择在线节点" /></SelectTrigger><SelectContent><SelectGroup>{availableNodes.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel>提供方模型</FieldLabel><Select value={providerModel ?? null} onValueChange={value => setModel(String(value))}><SelectTrigger className="w-full"><SelectValue placeholder="选择模型" /></SelectTrigger><SelectContent><SelectGroup>{(selectedNode?.models ?? []).map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="market-alias">公开模型别名</FieldLabel><Input id="market-alias" value={alias} onChange={event => setAlias(event.target.value)} placeholder="例如 whale-qwen-7b" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="input-price">输入 / 1K</FieldLabel><Input id="input-price" value={inputPrice} onChange={event => setInputPrice(event.target.value)} inputMode="decimal" /></Field><Field><FieldLabel htmlFor="output-price">输出 / 1K</FieldLabel><Input id="output-price" value={outputPrice} onChange={event => setOutputPrice(event.target.value)} inputMode="decimal" /></Field></div><Button onClick={publish} disabled={pending || !availableNodes.length}>{pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Globe2 data-icon="inline-start" />}发布 VTEST 供给</Button></FieldGroup></section>
        <section className="panel p-5"><div className="flex items-center justify-between gap-4"><div><h2 className="section-heading">调用凭据</h2><p className="pt-1 text-sm text-muted-foreground">market:invoke · 30 天 · 可随时撤销</p></div><KeyRound className="size-5 text-muted-foreground" /></div><div className="flex flex-col gap-4 pt-5"><Button variant="outline" onClick={issueToken} disabled={pending}><KeyRound data-icon="inline-start" />生成市场令牌</Button>{issued && <div className="rounded-lg border bg-secondary p-4"><code className="block truncate font-mono text-sm">{issued}</code><Button className="mt-3" variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(issued); setCopied(true) }}>{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{copied ? '已复制' : '复制'}</Button></div>}<div className="overflow-x-auto rounded-lg bg-foreground p-4 text-background"><pre className="font-mono text-sm leading-relaxed">{curl}</pre></div></div></section></div>
      <section className="panel"><div className="border-b p-5"><h2 className="section-heading">调用与用量</h2></div>{!data?.activity.length ? <Empty className="min-h-40"><EmptyHeader><EmptyTitle>还没有 API 调用</EmptyTitle><EmptyDescription>使用 market:invoke 令牌发起同步或异步请求后，这里会显示真实状态与用量。</EmptyDescription></EmptyHeader></Empty> : <ul className="divide-y">{data.activity.map(item => <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-sm">{item.model}</p><p className="pt-1 text-sm text-muted-foreground">{new Date(item.createdAt).toLocaleString('zh-CN')} · {item.inputTokens ?? 0} / {item.outputTokens ?? 0} tokens</p></div><div className="flex items-center gap-2"><Badge variant="outline">{item.status}</Badge><span className="font-mono text-sm">{item.settledAmount} VTEST</span></div></li>)}</ul>}</section>
    </div>}
  </div>
}

type Asset = { id: string; kind: string; taskId: string | null; contentType: string; byteSize: number; sha256: string; status: string; createdAt: string; url: string }
async function sha256(file: File) { const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') }

export function VideoMarketPanel() {
  const { user } = useWorkspace()
  const { nodes } = useNodes(!!user)
  const { data, mutate } = useSWR<{ assets: Asset[] }>(user ? '/api/media/tasks' : null, fetcher, { ...pollingConfig, refreshInterval: 5000 })
  const videoNodes = (nodes ?? []).filter(item => item.online && item.capabilities.includes('video:transcode'))
  const [file, setFile] = useState<File | null>(null); const [progress, setProgress] = useState(0); const [busy, setBusy] = useState(false)
  const [template, setTemplate] = useState('compress_mp4'); const [nodeId, setNodeId] = useState<string | null>(null)
  const inputAssets = data?.assets.filter(item => item.kind === 'input') ?? []; const outputAssets = data?.assets.filter(item => item.kind === 'output') ?? []
  async function uploadFile() {
    if (!user || !file) return
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type) || file.size > 250 * 1024 * 1024) return toast.error('仅支持不超过 250MB 的 MP4、MOV 或 WebM。')
    setBusy(true); setProgress(1)
    try {
      const assetId = crypto.randomUUID(); const hash = await sha256(file); const extension = file.type === 'video/webm' ? 'webm' : file.type === 'video/quicktime' ? 'mov' : 'mp4'
      await upload(`venus/${user.id}/${assetId}/input.${extension}`, file, { access: 'private', handleUploadUrl: '/api/media/upload', multipart: true, contentType: file.type, clientPayload: JSON.stringify({ assetId, contentType: file.type, byteSize: file.size, sha256: hash }), onUploadProgress: event => setProgress(event.percentage) })
      toast.success('素材已私有上传并进入完整性校验。'); setFile(null); void mutate()
    } catch { toast.error('上传失败或完整性校验未通过。') } finally { setBusy(false) }
  }
  async function submit(assetId: string) {
    const selected = nodeId ?? videoNodes[0]?.id
    if (!selected) return toast.error('暂无已授权且在线的视频节点。')
    setBusy(true)
    try { const response = await fetch('/api/media/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId, nodeId: selected, template, requestId: crypto.randomUUID(), organizationId: null }) }); const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error); toast.success(`视频任务已提交，预留 ${result.reserved} VTEST。`); void mutate() }
    catch { toast.error('视频任务提交失败，请检查节点能力和测试预算。') } finally { setBusy(false) }
  }
  return <div className="content-enter"><PageHeading title="鲸联视频" subtitle="素材只进入 private Blob；节点使用短时一次性令牌下载和回传，浏览器不接触 Blob 主令牌。" action={<Badge variant="secondary">固定 FFmpeg 模板</Badge>} />
    {!user ? <SignInEmpty icon={FileVideo2} title="登录后处理私有视频" description="上传、节点授权、摘要校验、成品预览与验收均绑定到你的真实账户。" /> : <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"><section className="panel p-5"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-secondary"><Upload className="size-5" /></span><div><h2 className="section-heading">上传私有素材</h2><p className="text-sm text-muted-foreground">MP4 / MOV / WebM · 最大 250MB</p></div></div><FieldGroup className="pt-5"><Field><FieldLabel htmlFor="video-file">选择视频</FieldLabel><Input id="video-file" type="file" accept="video/mp4,video/quicktime,video/webm" onChange={event => setFile(event.target.files?.[0] ?? null)} /></Field>{busy && progress > 0 && progress < 100 && <Progress value={progress} />}<Button onClick={uploadFile} disabled={!file || busy}>{busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Upload data-icon="inline-start" />}私有直传</Button></FieldGroup><div className="mt-5 flex items-start gap-3 rounded-lg border bg-secondary p-4"><ShieldCheck className="size-5 shrink-0" /><p className="text-sm leading-relaxed">提交处理即表示你授权选中的节点在本次 attempt 与 fence 有效期内读取素材。令牌使用后失效，成品默认保留 7 天且不公开分享。</p></div></section>
      <section className="panel p-5"><h2 className="section-heading">处理设置</h2><div className="flex flex-col gap-5 pt-5"><Tabs value={template} onValueChange={value => setTemplate(String(value))}><TabsList className="flex-wrap"><TabsTrigger value="compress_mp4">压缩 MP4</TabsTrigger><TabsTrigger value="resize_720p">转 720p</TabsTrigger><TabsTrigger value="resize_1080p">转 1080p</TabsTrigger></TabsList></Tabs><Field><FieldLabel>处理节点</FieldLabel><Select value={nodeId ?? videoNodes[0]?.id ?? null} onValueChange={value => setNodeId(String(value))}><SelectTrigger className="w-full"><SelectValue placeholder="选择视频节点" /></SelectTrigger><SelectContent><SelectGroup>{videoNodes.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><p className="text-sm leading-relaxed text-muted-foreground">模板参数由服务端固定；不接受任意 FFmpeg 参数、shell、远程 URL 或播放列表。</p></div></section>
      <section className="panel xl:col-span-2"><div className="flex items-center justify-between gap-4 border-b p-5"><h2 className="section-heading">素材与任务</h2><Badge variant="outline">{inputAssets.length} 份输入</Badge></div>{!inputAssets.length ? <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><FileVideo2 /></EmptyMedia><EmptyTitle>还没有已校验素材</EmptyTitle><EmptyDescription>完成私有直传后，素材会在服务端重新计算 SHA-256 并出现在这里。</EmptyDescription></EmptyHeader></Empty> : <div className="grid gap-4 p-5 md:grid-cols-2">{inputAssets.map(asset => <Card key={asset.id}><CardHeader><CardTitle className="text-base">输入素材</CardTitle><CardDescription>{(asset.byteSize / 1024 / 1024).toFixed(1)} MB · {asset.contentType}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><code className="truncate font-mono text-sm text-muted-foreground">SHA-256 {asset.sha256}</code><video controls preload="metadata" src={asset.url} className="aspect-video w-full rounded-lg bg-foreground" /><Button onClick={() => submit(asset.id)} disabled={busy || !videoNodes.length}><Play data-icon="inline-start" />提交固定模板</Button></CardContent></Card>)}</div>}</section>
      {outputAssets.length > 0 && <section className="panel xl:col-span-2"><div className="border-b p-5"><h2 className="section-heading">私有成品</h2></div><div className="grid gap-4 p-5 md:grid-cols-2">{outputAssets.map(asset => <Card key={asset.id}><CardHeader><CardTitle className="text-base">节点回传成品</CardTitle><CardDescription>{new Date(asset.createdAt).toLocaleString('zh-CN')} · {(asset.byteSize / 1024 / 1024).toFixed(1)} MB</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><video controls preload="metadata" src={asset.url} className="aspect-video w-full rounded-lg bg-foreground" /><Button variant="outline" render={<a href={`${asset.url}?download=1`} />}>下载成品</Button></CardContent></Card>)}</div></section>}
    </div>}
  </div>
}

type OrganizationListItem = { id: string; name: string; slug: string; type: string; status: string; role: string }
type OrganizationWorkspace = { organization: OrganizationListItem; currentRole: string; members: Array<{ id: string; role: string; status: string }>; departments: Array<{ id: string; name: string }>; costCenters: Array<{ id: string; code: string; name: string }>; quotas: Array<{ id: string; kind: string; limitValue: string; reservedValue: string; usedValue: string }>; audits: Array<{ id: string; action: string; targetType: string; createdAt: string }> }

export function OrganizationComputePanel() {
  const { user } = useWorkspace(); const { data, mutate } = useSWR<{ organizations: OrganizationListItem[] }>(user ? '/api/v1/organizations' : null, fetcher, pollingConfig)
  const [selectedId, setSelectedId] = useState<string | null>(null); const activeId = selectedId ?? data?.organizations[0]?.id ?? null
  const { data: workspace, mutate: mutateWorkspace } = useSWR<OrganizationWorkspace>(activeId ? `/api/v1/organizations/${activeId}` : null, fetcher, pollingConfig)
  const [name, setName] = useState(''); const [type, setType] = useState('enterprise'); const [departmentName, setDepartmentName] = useState(''); const [inviteEmail, setInviteEmail] = useState(''); const [inviteToken, setInviteToken] = useState(''); const [busy, setBusy] = useState(false)
  async function create() { if (!name.trim()) return; setBusy(true); try { const response = await fetch('/api/v1/organizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, type }) }); const result = await response.json(); if (!response.ok || !result.ok) throw new Error(); setName(''); setSelectedId(result.organizationId); await mutate(); toast.success('组织与 Owner 成员关系已创建。') } catch { toast.error('创建组织失败。') } finally { setBusy(false) } }
  async function addDepartment() { if (!activeId || !departmentName.trim()) return; setBusy(true); try { const response = await fetch(`/api/v1/organizations/${activeId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'department', name: departmentName, parentId: null }) }); if (!response.ok) throw new Error(); setDepartmentName(''); void mutateWorkspace(); toast.success('部门已创建并写入审计。') } catch { toast.error('只有 Owner / Admin 可以创建部门。') } finally { setBusy(false) } }
  async function sendInvite() { if (!activeId || !inviteEmail.trim()) return; setBusy(true); try { const response = await fetch(`/api/v1/organizations/${activeId}/invites`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail, role: 'member' }) }); if (!response.ok) throw new Error(); setInviteEmail(''); toast.success('一次性邀请令牌已通过 Resend 发送。') } catch { toast.error('邀请发送失败或你没有成员管理权限。') } finally { setBusy(false) } }
  async function acceptInvite() { if (!inviteToken.trim()) return; setBusy(true); try { const response = await fetch('/api/v1/organizations/invites/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: inviteToken }) }); const result = await response.json(); if (!response.ok || !result.ok) throw new Error(); setInviteToken(''); setSelectedId(result.organizationId); void mutate(); toast.success('已加入组织。') } catch { toast.error('邀请无效、已使用、已过期或邮箱不匹配。') } finally { setBusy(false) } }
  const usage = useMemo(() => workspace?.quotas.reduce((sum, item) => sum + Number(item.usedValue), 0) ?? 0, [workspace])
  return <div className="content-enter"><PageHeading title="组织算力" subtitle="面向企业与学校的部门节点池、成本中心、配额和审计；内部调剂不生成可提现收益。" action={workspace && <Badge variant="secondary">{workspace.currentRole}</Badge>} />
    {!user ? <SignInEmpty icon={Building2} title="登录后创建组织工作区" description="组织数据通过服务端 membership 与 role 校验隔离，不依赖界面隐藏。" /> : <div className="grid gap-6 xl:grid-cols-[340px_1fr]"><aside className="flex flex-col gap-6"><section className="panel p-5"><h2 className="section-heading">创建组织</h2><FieldGroup className="pt-5"><Field><FieldLabel htmlFor="org-name">组织名称</FieldLabel><Input id="org-name" value={name} onChange={event => setName(event.target.value)} placeholder="例如 鲸联实验室" /></Field><Field><FieldLabel>组织类型</FieldLabel><Tabs value={type} onValueChange={value => setType(String(value))}><TabsList><TabsTrigger value="enterprise">企业</TabsTrigger><TabsTrigger value="school">学校</TabsTrigger></TabsList></Tabs></Field><Button onClick={create} disabled={busy || !name.trim()}><Plus data-icon="inline-start" />创建组织</Button></FieldGroup></section><section className="panel"><div className="border-b p-4"><h2 className="section-heading">我的组织</h2></div><div className="flex flex-col gap-2 p-3">{data?.organizations.map(item => <button key={item.id} onClick={() => setSelectedId(item.id)} className="flex items-center justify-between rounded-lg border bg-background p-3 text-left"><span><span className="block text-sm font-medium">{item.name}</span><span className="text-sm text-muted-foreground">{item.type === 'school' ? '学校' : '企业'}</span></span><Badge variant={activeId === item.id ? 'secondary' : 'outline'}>{item.role}</Badge></button>)}</div></section><section className="panel p-5"><h2 className="section-heading">成员邀请</h2><FieldGroup className="pt-4"><Field><FieldLabel htmlFor="invite-email">邀请成员邮箱</FieldLabel><Input id="invite-email" type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="member@example.com" /></Field><Button variant="outline" onClick={sendInvite} disabled={busy || !activeId || !inviteEmail.trim()}>发送 Member 邀请</Button><Field><FieldLabel htmlFor="invite-token">接受邀请令牌</FieldLabel><Input id="invite-token" value={inviteToken} onChange={event => setInviteToken(event.target.value)} placeholder="voi_…" /></Field><Button variant="outline" onClick={acceptInvite} disabled={busy || !inviteToken.trim()}>接受邀请</Button></FieldGroup></section></aside>
      {!workspace ? <section className="panel"><Empty className="min-h-96"><EmptyHeader><EmptyMedia variant="icon"><Building2 /></EmptyMedia><EmptyTitle>选择或创建一个组织</EmptyTitle><EmptyDescription>Owner 创建后可以逐步配置部门、成本中心、配额和组织节点池。</EmptyDescription></EmptyHeader></Empty></section> : <div className="flex flex-col gap-6"><div className="grid gap-4 sm:grid-cols-3"><Card><CardHeader><CardDescription>成员</CardDescription><CardTitle className="text-3xl">{workspace.members.length}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>部门</CardDescription><CardTitle className="text-3xl">{workspace.departments.length}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>已归集用量</CardDescription><CardTitle className="font-mono text-3xl">{usage.toFixed(4)}</CardTitle></CardHeader></Card></div><section className="panel p-5"><div className="flex items-center gap-3"><Users className="size-5" /><div><h2 className="section-heading">组织结构</h2><p className="text-sm text-muted-foreground">Owner / Admin 可管理；Operator 管节点和任务，Member 仅提交授权任务。</p></div></div><FieldGroup className="pt-5"><Field orientation="horizontal"><Input value={departmentName} onChange={event => setDepartmentName(event.target.value)} placeholder="新部门名称" aria-label="新部门名称" /><Button onClick={addDepartment} disabled={busy || !departmentName.trim()}><Plus data-icon="inline-start" />添加部门</Button></Field></FieldGroup><div className="grid gap-3 pt-5 sm:grid-cols-2">{workspace.departments.map(item => <div key={item.id} className="rounded-lg border bg-background p-4"><p className="font-medium">{item.name}</p><p className="pt-1 text-sm text-muted-foreground">组织内节点与任务范围</p></div>)}</div></section><section className="panel"><div className="flex items-center justify-between gap-4 border-b p-5"><h2 className="section-heading">配额与审计</h2><ShieldCheck className="size-5 text-muted-foreground" /></div><div className="grid gap-6 p-5 lg:grid-cols-2"><div><h3 className="text-sm font-medium">配额守恒</h3><div className="flex flex-col gap-3 pt-3">{workspace.quotas.length ? workspace.quotas.map(item => <div key={item.id} className="rounded-lg border p-3"><div className="flex items-center justify-between"><span className="text-sm">{item.kind}</span><span className="font-mono text-sm">{item.usedValue} / {item.limitValue}</span></div></div>) : <p className="text-sm text-muted-foreground">尚未配置组织配额。</p>}</div></div><div><h3 className="text-sm font-medium">最近审计</h3><ul className="flex flex-col gap-3 pt-3">{workspace.audits.map(item => <li key={item.id} className="flex items-center justify-between gap-3 text-sm"><span>{item.action}</span><span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString('zh-CN')}</span></li>)}</ul></div></div></section></div>}
    </div>}
  </div>
}
