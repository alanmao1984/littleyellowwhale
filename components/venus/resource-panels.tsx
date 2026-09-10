'use client'

import { useState } from 'react'
import { Plus, Search, ListTodo, Cpu, ArrowUpRight, Wallet, LockKeyhole, ReceiptText, Info, FileText, ShieldCheck, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { useWorkspace } from './workspace-context'
import { PageHeading } from './workspace'
import { useLedger, useTasks, useWallet } from '@/lib/venus/use-workspace-data'
import { formatDisplay } from '@/lib/venus/money'
import { cancelTask } from '@/app/actions/tasks'
import type { TaskView } from '@/lib/venus/ledger'
import { TaskResultsDialog } from './task-results-dialog'

const TASK_STATUS: Record<string, [string, string, 'secondary' | 'outline']> = {
  pending_nodes: ['未授权执行', 'Not authorized', 'outline'],
  queued: ['等待节点领取', 'Queued', 'outline'],
  running: ['执行中', 'Running', 'secondary'],
  cancelling: ['正在请求中止', 'Abort requested', 'outline'],
  review: ['结果待核验', 'Awaiting review', 'secondary'],
  cancelled: ['已取消', 'Cancelled', 'secondary'],
}

function statusLabel(status: string, locale: 'zh' | 'en') {
  const entry = TASK_STATUS[status]
  if (!entry) return status
  return locale === 'zh' ? entry[0] : entry[1]
}

function TaskRow({ task }: { task: TaskView }) {
  const { t, locale } = useWorkspace()
  const { refreshTasks } = useTasks(true)
  const { refreshWallet } = useWallet(true)
  const [pending, setPending] = useState(false)
  const statusStyle = TASK_STATUS[task.status]?.[2] ?? 'outline'
  async function onCancel() {
    setPending(true)
    try {
      const result = await cancelTask(task.id)
      if (result.ok) {
        toast.success(t(`已停止新派发，释放 ${formatDisplay(result.released)} VTEST；在途记录保留待核验。`, `Dispatch stopped. Released ${formatDisplay(result.released)} VTEST; in-flight records remain under review.`))
        void refreshTasks(); void refreshWallet()
      } else {
        toast.error(t('无法取消该任务。', 'This task cannot be cancelled.'))
      }
    } catch {
      toast.error(t('取消失败，请稍后再试。', 'Cancel failed. Please try again.'))
    } finally {
      setPending(false)
    }
  }
  return (
    <li className="flex flex-col gap-3 p-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusStyle}>{statusLabel(task.status, locale)}</Badge>
          <span className="text-sm text-muted-foreground">{new Date(task.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</span>
        </div>
        <p className="truncate pt-2 text-sm leading-relaxed">{task.instruction}</p>
        {task.model && <p className="pt-1 text-sm text-muted-foreground">{task.nodeName} · {task.model}</p>}
        <p className="pt-1 text-sm text-muted-foreground">
          {t(`${task.itemCount} 条记录 · 并行 ${task.concurrency} · 预留 ${formatDisplay(task.reservedAmount)} ${task.currency}`, `${task.itemCount} records · concurrency ${task.concurrency} · reserved ${formatDisplay(task.reservedAmount)} ${task.currency}`)}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2"><TaskResultsDialog taskId={task.id} />
        {!task.cancelRequested && ['pending_nodes', 'queued', 'running'].includes(task.status) && (
          <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <X data-icon="inline-start" />}{t('取消', 'Cancel')}
          </Button>
        )}
      </div>
    </li>
  )
}

export function TasksPanel() {
  const { t, setModal, setDraft, user } = useWorkspace()
  const [search, setSearch] = useState('')
  const { tasks, tasksLoading } = useTasks(!!user)
  const query = search.trim().toLowerCase()
  const visibleTasks = (tasks ?? []).filter((task) => !query || task.instruction.toLowerCase().includes(query))
  return <div className="content-enter"><PageHeading title={t('任务中心', 'Task center')} subtitle={t('从一个想法到一次执行，所有任务尽在掌握。', 'From an idea to execution. All your tasks, in one place.')} action={<Button onClick={() => setModal('task')}><Plus data-icon="inline-start" />{t('创建任务', 'Create task')}</Button>} />
    <section className="panel"><div className="flex flex-wrap items-center justify-between gap-4 border-b p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ListTodo className="size-4" />{user ? t(`共 ${tasks?.length ?? 0} 个任务`, `${tasks?.length ?? 0} tasks`) : t('未登录', 'Signed out')}</div><div className="flex items-center gap-2"><Search className="size-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} aria-label={t('搜索任务', 'Search tasks')} placeholder={t('搜索任务指令…', 'Search instructions…')} className="w-48" disabled={!user} /></div></div>
      {!user
        ? <Empty className="min-h-80"><EmptyHeader><EmptyMedia variant="icon"><ListTodo /></EmptyMedia><EmptyTitle>{t('你的任务旅程，即将开始', 'Your task journey starts here')}</EmptyTitle><EmptyDescription>{t('尚未登录，暂无可读取的个人任务。你可以先创建草稿，检查输入与拆分方式，或登录后提交并预留测试预算。', 'Sign in to view your tasks. You can prepare a draft first, or sign in to submit and reserve test budget.')}</EmptyDescription></EmptyHeader><div className="flex flex-wrap justify-center gap-3"><Button onClick={() => setModal('task')}><Plus data-icon="inline-start" />{t('准备任务草稿', 'Prepare a draft')}</Button><a href="/sign-in" className="text-sm font-medium underline underline-offset-4">{t('登录', 'Sign in')}</a></div></Empty>
        : tasksLoading
          ? <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />{t('正在加载任务…', 'Loading tasks…')}</div>
          : visibleTasks.length === 0
            ? <Empty className="min-h-80"><EmptyHeader><EmptyMedia variant="icon"><ListTodo /></EmptyMedia><EmptyTitle>{query ? t('没有匹配的任务', 'No matching tasks') : t('还没有任务', 'No tasks yet')}</EmptyTitle><EmptyDescription>{query ? t('换个关键词再试试。', 'Try a different keyword.') : t('创建第一个任务：系统会按行拆分、服务端计价并预留测试预算，等待节点接入后执行。', 'Create your first task. It is split by line, priced server-side, and reserves test budget while awaiting nodes.')}</EmptyDescription></EmptyHeader>{!query && <Button onClick={() => setModal('task')}><Plus data-icon="inline-start" />{t('创建任务', 'Create task')}</Button>}</Empty>
            : <ul className="divide-y">{visibleTasks.map((task) => <TaskRow key={task.id} task={task} />)}</ul>}
    </section>
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-primary/30 bg-secondary p-4 text-foreground"><Info className="size-5 shrink-0" /><p className="text-sm leading-relaxed">{t('只有明确选择并授权的自有节点可以执行。取消只释放未派发记录的测试预留；在途、过期或已回传结果均保留待核验，不自动重试或生成收益。测试资金不可提现。', 'Only explicitly authorized own nodes can execute. Cancellation releases undispatched reservations only. In-flight, expired and returned work stays under review, without automatic retries or earnings. Test funds cannot be withdrawn.')}</p></div>
    <h2 className="section-heading pb-4 pt-8">{t('从常用场景开始', 'Start with a common use case')}</h2><div className="grid gap-4 md:grid-cols-3">{[['批量翻译', 'Batch translation', '逐条翻译，保留专业术语与品牌名称。', 'Translate each record, preserving terms and brand names.'], ['内容摘要', 'Content summaries', '提炼长文本重点，快速理解核心信息。', 'Extract the key points from each long text.'], ['结构化提取', 'Structured extraction', '从文本中提取指定字段，便于后续处理。', 'Extract specific fields for further processing.']].map(([zh, en, descZh, descEn]) => <button className="panel p-5 text-left transition-colors hover:border-primary/60" key={en} onClick={() => { setDraft(t(descZh, descEn)); setModal('task') }}><div className="flex items-center justify-between"><FileText className="size-5 text-muted-foreground" /><ArrowUpRight className="size-4 text-muted-foreground" /></div><h3 className="pb-2 pt-4 text-base font-medium">{t(zh, en)}</h3><p className="text-sm leading-relaxed text-muted-foreground">{t(descZh, descEn)}</p></button>)}</div>
  </div>
}

export function ComputePanel() {
  const { t, setModal } = useWorkspace()
  const [type, setType] = useState('text')
  return <div className="content-enter"><PageHeading title={t('算力池', 'Compute pool')} subtitle={t('发现经过验证的计算能力，把任务交给合适的节点。', 'Discover verified compute and find the right node for your task.')} action={<Button variant="outline" onClick={() => setModal('connect')}><Plus data-icon="inline-start" />{t('贡献算力', 'Contribute compute')}</Button>} /><section className="panel"><div className="border-b p-5"><Tabs value={type} onValueChange={value => setType(String(value))}><TabsList>{[['text', '文本推理', 'Text inference'], ['image', '图像生成', 'Image generation'], ['video', '视频处理', 'Video processing']].map(([value, zh, en]) => <TabsTrigger value={value} key={value}>{t(zh, en)}</TabsTrigger>)}</TabsList></Tabs></div><Empty className="min-h-80"><EmptyHeader><EmptyMedia variant="icon"><Cpu /></EmptyMedia><EmptyTitle>{type === 'text' ? t('节点网络，等待第一份连接', 'The network is waiting for its first connection') : t('更多能力，正在准备中', 'More capabilities are on the way')}</EmptyTitle><EmptyDescription>{type === 'text' ? t('服务发现尚未启用，不展示未经验证的模型、价格或在线数量。首批适配 Ollama 与 vLLM 文本服务。', 'Service discovery is not yet enabled. Models, prices and online counts will only appear after verification. Ollama and vLLM text services are first.') : t('图像与视频执行属于后续扩展，当前不接受此类任务。', 'Image and video execution are planned extensions and do not accept tasks yet.')}</EmptyDescription></EmptyHeader><Button variant="outline" onClick={() => setModal('connect')}>{t('查看节点接入指南', 'View the node guide')}<ArrowUpRight data-icon="inline-end" /></Button></Empty></section><div className="flex items-start gap-3 rounded-xl border bg-card p-5 text-card-foreground mt-5"><ShieldCheck className="size-5 shrink-0" /><div><h2 className="text-sm font-medium">{t('共享算力，不共享控制权', 'Share compute, not control')}</h2><p className="pt-1 text-sm leading-relaxed text-muted-foreground">{t('节点仅执行明确授权的任务。模型密钥保留在设备本地；提交的任务文本会发送到你批准的提供方。', 'Nodes only execute authorized tasks. Model credentials stay on the device; task text is sent to the provider you approve.')}</p></div></div></div>
}

export function EarningsPanel() {
  const { t, locale, user } = useWorkspace()
  const { wallet, walletLoading } = useWallet(!!user)
  const { entries, ledgerLoading } = useLedger(!!user)
  const metrics: [string, string, string, typeof Wallet][] = wallet
    ? [
        ['可用测试预算', 'Spendable test budget', wallet.spendingAvailable, Wallet],
        ['预留中', 'Reserved', wallet.spendingReserved, LockKeyhole],
        ['T+7 待解冻收益', 'T+7 escrowed earnings', wallet.earningEscrowed, ReceiptText],
        ['已解冻测试收益', 'Available test earnings', wallet.earningAvailable, Wallet],
      ]
    : []
  return <div className="content-enter"><PageHeading title={t('收益账本', 'Earnings ledger')} subtitle={t('每一笔计算，都有迹可循。', 'A transparent record of every computation.')} action={<Badge variant="secondary">{t('测试账本', 'Test ledger')}</Badge>} /><div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-secondary p-4 text-foreground"><Info className="size-5 shrink-0" /><p className="text-sm leading-relaxed">{t('当前为测试资金，不可充值、提现或兑换。分账比例为供给方 85%、经纪 5%、平台 10%；未绑定经纪的份额保留为未分配。', 'Test funds only: no deposits, withdrawals or conversions. Planned split: provider 85%, broker 5%, platform 10%. Unassigned broker shares remain unallocated.')}</p></div>
    {!user
      ? <section className="panel mt-6"><Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><ReceiptText /></EmptyMedia><EmptyTitle>{t('每一份贡献，都会被记录', 'Every contribution will be recorded')}</EmptyTitle><EmptyDescription>{t('登录后查看属于你的测试账目，不展示虚构收入或增长。新账户将获得一次性测试预算，仅用于体验任务预留。', 'Sign in to view your own test ledger. No invented revenue or growth. New accounts receive a one-time test budget for reservations only.')}</EmptyDescription></EmptyHeader><a href="/sign-in" className="text-sm font-medium underline underline-offset-4">{t('登录', 'Sign in')}</a></Empty></section>
      : <><div className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([zh, en, value, Icon]) => { const MetricIcon = Icon; return <Card key={en} className="[--card-spacing:--spacing(5)]"><CardHeader><CardTitle><span className="flex items-center justify-between text-sm text-muted-foreground">{t(zh, en)}<MetricIcon className="size-4" /></span></CardTitle></CardHeader><CardContent><p className="font-mono text-3xl tabular-nums">{walletLoading && !wallet ? '—' : formatDisplay(value)}</p><p className="pt-2 text-sm text-muted-foreground">{wallet?.currency ?? 'VTEST'} · {t('测试', 'test')}</p></CardContent></Card> })}</div>
        <section className="panel"><div className="flex items-center justify-between border-b p-5"><h2 className="section-heading">{t('账本流水', 'Ledger entries')}</h2><Badge variant="outline">{t('不可提现', 'Non-withdrawable')}</Badge></div>
          {ledgerLoading && !entries
            ? <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />{t('正在加载账本…', 'Loading ledger…')}</div>
            : (entries?.length ?? 0) === 0
              ? <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><ReceiptText /></EmptyMedia><EmptyTitle>{t('暂无流水', 'No entries yet')}</EmptyTitle><EmptyDescription>{t('创建任务预留测试预算后，这里会出现可核查的借贷流水。', 'Reserve test budget by creating a task and balanced entries will appear here.')}</EmptyDescription></EmptyHeader></Empty>
              : <ul className="divide-y">{entries!.map((entry) => <li key={entry.id} className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate text-sm">{entry.description}</p><p className="pt-1 text-sm text-muted-foreground">{new Date(entry.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')} · {entry.account}</p></div><span className={cn('shrink-0 font-mono text-sm tabular-nums', entry.amount.startsWith('-') ? 'text-muted-foreground' : 'text-foreground')}>{entry.amount.startsWith('-') ? '' : '+'}{formatDisplay(entry.amount)}</span></li>)}</ul>}
        </section></>}
  </div>
}
