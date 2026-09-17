'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Check, Eye, FileDiff, GitPullRequest, Loader2, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { reviewTaskItem } from '@/app/actions/tasks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchJson, pollingConfig } from '@/lib/venus/request'
import type { getTaskResults } from '@/lib/venus/execution'
import type { TaskView } from '@/lib/venus/ledger'
import { CockpitDiff } from './cockpit-diff'
import { useWorkspace } from './workspace-context'

type Results = NonNullable<Awaited<ReturnType<typeof getTaskResults>>>
type Dispatch = { accepted: boolean; reason: string; retryAfterMs: number; nodeActive: number; nodeLimit: number; taskActive: number; taskLimit: number; label: { zh: string; en: string } }

const statusLabels: Record<string, [string, string]> = {
  pending_nodes: ['待选节点', 'Awaiting node'], queued: ['待领取', 'Queued'], running: ['执行中', 'Running'], review: ['待审批', 'Review'], cancelling: ['中止中', 'Cancelling'], cancelled: ['已取消', 'Cancelled'],
}

export function TaskCockpit({ tasks }: { tasks: TaskView[] }) {
  const { locale, t } = useWorkspace()
  const [selectedId, setSelectedId] = useState(tasks[0]?.id ?? '')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const resultsUrl = selectedId ? `/api/v1/tasks/${selectedId}/results` : null
  const dispatchUrl = selectedId ? `/api/v1/tasks/${selectedId}/dispatch` : null
  const { data: results, mutate } = useSWR<Results>(resultsUrl, fetchJson, { ...pollingConfig, refreshInterval: 5000 })
  const { data: dispatch } = useSWR<Dispatch>(dispatchUrl, fetchJson, { ...pollingConfig, refreshInterval: 5000 })
  const selected = useMemo(() => tasks.find(task => task.id === selectedId) ?? tasks[0], [selectedId, tasks])
  const item = results?.items.find(entry => entry.status === 'review' && !entry.reviewDecision) ?? results?.items[0]

  async function decide(decision: 'accepted' | 'rejected') {
    if (!selected || !item || !reason.trim() || pending) return
    setPending(true)
    try {
      const result = await reviewTaskItem(selected.id, { itemId: item.id, decision, reason })
      if (!result.ok) throw new Error('review_failed')
      toast.success(t('审批决定已保存。', 'Review decision saved.'))
      setReason('')
      await mutate()
    } catch {
      toast.error(t('审批未保存，请刷新后重试。', 'Review was not saved. Refresh and retry.'))
    } finally {
      setPending(false)
    }
  }

  if (!selected) return null
  const status = statusLabels[selected.status] ?? [selected.status, selected.status]

  return <section className="overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="task-cockpit-title">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-secondary"><GitPullRequest className="size-4" /></span><div><h2 id="task-cockpit-title" className="text-base font-semibold tracking-tight">{t('任务驾驶舱', 'Task cockpit')}</h2><p className="text-sm text-muted-foreground">{t('Diff、审批与结果预览集中在同一工作面。', 'Diff, approval, and preview in one workspace.')}</p></div></div>
      <div className="flex items-center gap-2"><Badge variant="outline">{t(...status)}</Badge>{dispatch && <Badge variant={dispatch.accepted ? 'secondary' : 'outline'}><ShieldCheck data-icon="inline-start" />{locale === 'zh' ? dispatch.label.zh : dispatch.label.en}</Badge>}</div>
    </header>
    <div className="grid min-h-96 md:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="border-b border-border bg-background p-2 md:border-r md:border-b-0" aria-label={t('任务列表', 'Task list')}>
        <div className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">{tasks.slice(0, 12).map(task => {
          const labels = statusLabels[task.status] ?? [task.status, task.status]
          return <button key={task.id} type="button" onClick={() => setSelectedId(task.id)} data-active={task.id === selected.id} className="flex min-w-48 flex-col gap-1 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:bg-card data-[active=true]:border-primary data-[active=true]:bg-secondary md:min-w-0">
            <span className="truncate text-sm font-medium">{task.instruction}</span><span className="font-mono text-sm text-muted-foreground">{t(...labels)} · {task.itemCount} {t('条', 'items')}</span>
          </button>
        })}</div>
      </aside>
      <div className="min-w-0 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4"><div><p className="text-balance font-medium">{selected.instruction}</p><p className="pt-1 font-mono text-sm text-muted-foreground">{selected.nodeName ?? t('未分配节点', 'No node')} · {selected.model ?? t('未选择模型', 'No model')}</p></div>{dispatch && <p className="font-mono text-sm text-muted-foreground">{dispatch.nodeActive}/{dispatch.nodeLimit} {t('节点槽位', 'node slots')} · {dispatch.taskActive}/{dispatch.taskLimit} {t('任务槽位', 'task slots')}</p>}</div>
        <Tabs defaultValue="diff">
          <TabsList variant="line" className="mb-4"><TabsTrigger value="diff"><FileDiff data-icon="inline-start" />{t('Diff', 'Diff')}</TabsTrigger><TabsTrigger value="approval"><Check data-icon="inline-start" />{t('审批', 'Approval')}</TabsTrigger><TabsTrigger value="preview"><Eye data-icon="inline-start" />{t('预览', 'Preview')}</TabsTrigger></TabsList>
          <TabsContent value="diff"><CockpitDiff before={item?.input ?? selected.instruction} after={item?.output ?? null} /></TabsContent>
          <TabsContent value="approval"><div className="flex flex-col gap-4 rounded-lg border border-border p-4"><div><p className="font-medium">{item ? t(`记录 ${item.index + 1}`, `Record ${item.index + 1}`) : t('等待可审批记录', 'Waiting for a reviewable record')}</p><p className="pt-1 text-sm leading-relaxed text-muted-foreground">{t('接受或拒收前必须填写核验依据；决定写入审计记录且不可撤销。', 'A review note is required. The decision is audited and cannot be reversed.')}</p></div><Input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} disabled={!item || !!item.reviewDecision || pending} placeholder={t('填写质量、格式或安全核验依据', 'Document quality, format, or safety checks')} aria-label={t('审批依据', 'Review note')} /><div className="flex flex-wrap gap-2"><Button disabled={!item || item.status !== 'review' || !!item.reviewDecision || !reason.trim() || pending} onClick={() => decide('accepted')}>{pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Check data-icon="inline-start" />}{t('接受结果', 'Accept')}</Button><Button variant="outline" disabled={!item || item.status !== 'review' || !!item.reviewDecision || !reason.trim() || pending} onClick={() => decide('rejected')}><X data-icon="inline-start" />{t('拒收结果', 'Reject')}</Button></div>{item?.reviewDecision && <Badge variant="secondary">{item.reviewDecision === 'accepted' ? t('已接受', 'Accepted') : t('已拒收', 'Rejected')}</Badge>}</div></TabsContent>
          <TabsContent value="preview"><article className="min-h-52 rounded-lg border border-border bg-background p-4"><p className="pb-3 text-sm font-medium text-muted-foreground">{t('安全文本预览', 'Safe text preview')}</p>{item?.output ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.output}</p> : <p className="text-sm text-muted-foreground">{t('结果尚未到达。', 'No result yet.')}</p>}</article></TabsContent>
        </Tabs>
      </div>
    </div>
  </section>
}
