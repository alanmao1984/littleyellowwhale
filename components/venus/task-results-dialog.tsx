'use client'

import { useState } from 'react'
import useSWR, { mutate as mutateCache } from 'swr'
import { Download, FileText, Loader2, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { settleTask, reviewTaskItem } from '@/app/actions/tasks'
import { useWorkspace } from './workspace-context'
import type { getTaskResults } from '@/lib/venus/execution'

type Results = NonNullable<Awaited<ReturnType<typeof getTaskResults>>>
type Item = Results['items'][number]
const errors: Record<string, [string, string]> = { lease_expired: ['租约已过期，执行结果不确定', 'Lease expired; execution outcome uncertain'], cancel_requested: ['已请求中止，等待核验', 'Abort requested; review required'], inference_error: ['本机推理异常，未自动重试', 'Local inference error; no automatic retry'], media_error: ['本机媒体处理异常，未自动重试', 'Local media error; no automatic retry'], policy_changed: ['资源策略已变化', 'Resource policy changed'], shutdown: ['节点已退出', 'Runtime stopped'], lease_lost: ['续租失败，已请求中止', 'Renewal failed; abort requested'] }

function ReviewControls({ taskId, item, onChanged }: { taskId: string; item: Item; onChanged: () => Promise<unknown> }) {
  const { t } = useWorkspace()
  const [decision, setDecision] = useState<'accepted' | 'rejected' | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  async function confirm() {
    if (!decision || !reason.trim() || pending) return
    setPending(true)
    try {
      const result = await reviewTaskItem(taskId, { itemId: item.id, decision, reason })
      if (!result.ok) { toast.error(t('核验未保存，状态可能已变化，请刷新。', 'Review not saved. Refresh to check the current state.')); return }
      await onChanged(); setDecision(null); setReason('')
    } catch { toast.error(t('保存失败，请稍后重试。', 'Could not save. Please retry.')) }
    finally { setPending(false) }
  }
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap gap-2">
      {!!item.output?.trim() && !item.errorCode && <Button size="sm" variant="outline" disabled={pending} onClick={() => setDecision('accepted')}>{t('接受结果', 'Accept result')}</Button>}
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setDecision('rejected')}>{t('拒收并释放测试预算', 'Reject and release test budget')}</Button>
    </div>
    {decision && <div className="rounded-md border border-border bg-muted p-3 text-foreground">
      <Field><FieldLabel htmlFor={`reason-${item.id}`}>{decision === 'accepted' ? t('确认接受：核验说明', 'Confirm acceptance: review note') : t('确认拒收：原因', 'Confirm rejection: reason')}</FieldLabel>
        <Textarea id={`reason-${item.id}`} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} disabled={pending} />
        <FieldDescription>{t('决定确认后不可更改；全部记录终止并完成整单确认后，才实际分账或退款。不确定任务不会自动重跑。', 'Decisions are final. Budget moves only after all execution stops and the whole task is finalized. Uncertain work is never rerun automatically.')}</FieldDescription>
      </Field>
      <div className="flex flex-wrap gap-2 pt-3"><Button size="sm" disabled={pending || !reason.trim()} onClick={confirm}>{pending ? t('保存中…', 'Saving…') : t('确认此决定', 'Confirm decision')}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => setDecision(null)}>{t('返回', 'Back')}</Button></div>
    </div>}
  </div>
}

export function TaskResultsDialog({ taskId }: { taskId: string }) {
  const { t } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [settling, setSettling] = useState(false)
  const [confirmation, setConfirmation] = useState<'all' | 'reviewed' | null>(null)
  const url = `/api/v1/tasks/${taskId}/results`
  const { data, error, isLoading, mutate: refresh } = useSWR<Results>(open ? url : null, async requestUrl => {
    const response = await fetch(requestUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error('request_failed')
    return response.json()
  }, { refreshInterval: open ? 5000 : 0 })
  const count = (status: string) => data?.items.filter(item => item.status === status).length ?? 0
  const terminal = !!data && data.settlement === 'unverified' && data.items.length > 0 && data.items.every(item => ['review', 'cancelled'].includes(item.status))
  const reviewed = terminal && data.items.every(item => item.status === 'cancelled' || !!item.reviewDecision)
  const canAcceptAll = terminal && data.items.some(item => item.status === 'review' && !item.reviewDecision) && data.items.every(item => item.status === 'cancelled' || item.reviewDecision === 'rejected' || (!!item.output?.trim() && !item.errorCode))
  async function confirmSettlement() {
    if (!confirmation || settling) return
    setSettling(true)
    try {
      const result = await settleTask(taskId, confirmation === 'all')
      if (result.ok) {
        toast.success(t(`测试处置已完成：供给方 ${result.provider}，累计退款 ${result.refunded} VTEST。`, `Test settlement completed: provider ${result.provider}, total refund ${result.refunded} VTEST.`))
        setConfirmation(null)
        await refresh(); void mutateCache('/api/v1/tasks'); void mutateCache('/api/v1/wallet'); void mutateCache('/api/v1/ledger')
      } else toast.error(t('尚不能最终处置，请检查未结束或未核验的记录。', 'Cannot finalize yet. Check unfinished or unreviewed records.'))
    } catch { toast.error(t('处置失败，请刷新后重试；重复确认不会重复扣款。', 'Finalization failed. Refresh and retry; retries cannot double-charge.')) }
    finally { setSettling(false) }
  }
  const decisionLabel = (value: string | null) => value === 'accepted' ? t('已接受', 'Accepted') : value === 'rejected' ? t('已拒收', 'Rejected') : value === 'cancelled' ? t('未派发已取消', 'Cancelled before dispatch') : t('待核验', 'Unreviewed')
  return <>
    <Button size="sm" variant="outline" onClick={() => { setConfirmation(null); setOpen(true) }}><FileText data-icon="inline-start" />{t('进度与结果', 'Progress & results')}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t('任务进度与结果', 'Task progress & results')}</DialogTitle><DialogDescription>{t('节点输出不是独立质量证明。逐条接受或拒收，再整单确认测试预算处置；仅支持同一所有者的自有节点。', 'Node output is not independent proof of quality. Review records, then finalize the test budget. Only same-owner nodes are supported.')}</DialogDescription></DialogHeader>
      {isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t('读取中…', 'Loading…')}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{t('无法读取结果，请稍后再试。', 'Could not load results. Please retry.')}</p>}
      {data && <>
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t(`待领取 ${count('pending')}`, `Pending ${count('pending')}`)}</Badge><Badge variant="outline">{t(`执行中 ${count('running')}`, `Running ${count('running')}`)}</Badge><Badge variant="secondary">{data.settlement === 'settled' ? t('整单已处置', 'Finalized') : t('待最终处置', 'Awaiting finalization')}</Badge></div>
        <p className="break-words text-sm text-muted-foreground">{data.taskType} · {data.operation} · {data.nodeName ?? t('未授权执行', 'Execution not authorized')}{data.model && ` · ${data.model}`}</p>
        <p className="text-sm">{t('剩余待处置预留', 'Remaining reserved budget')}：{data.reservedAmount} VTEST</p>
        {data.settlementDetail && <section className="rounded-lg border border-border bg-muted p-4 text-foreground" aria-label={t('测试结算明细', 'Test settlement detail')}>
          <p className="text-sm font-medium">{t('已接受 / 累计退款', 'Accepted / total refund')}：{data.settlementDetail.acceptedAmount} / {data.settlementDetail.refundedAmount} VTEST</p>
          <p className="pt-2 text-sm">{t('供给方 / 未分配经纪 / 平台', 'Provider / unassigned broker / platform')}：{data.settlementDetail.providerAmount} / {data.settlementDetail.brokerAmount} / {data.settlementDetail.platformAmount}</p>
          <p className="pt-2 text-sm">{data.settlementDetail.status === 'released' ? t('测试收益已解冻（或无待解冻金额）', 'Released (or no escrow amount)') : t('T+7 到期时间（UTC）', 'T+7 due time (UTC)')}{data.settlementDetail.status !== 'released' && `：${data.settlementDetail.releaseAt}`}</p>
          <p className="pt-2 text-sm text-muted-foreground">{t('解冻后仍不可提现、转账或兑换黄金。', 'Released test funds cannot be withdrawn, transferred or redeemed for gold.')}</p>
        </section>}
        {data.settlement === 'settled' && !data.settlementDetail && <p className="text-sm text-muted-foreground">{t('历史分账：缺少到期快照，未自动回填或解冻，需独立对账。', 'Legacy settlement: no due-time snapshot. No automatic backfill or release; reconciliation is required.')}</p>}
        <ol className="flex flex-col gap-3">{data.items.map(item => <li key={item.id} className="rounded-lg border border-border bg-background p-4 text-foreground">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{t(`记录 ${item.index + 1}`, `Record ${item.index + 1}`)}</p><Badge variant="outline">{decisionLabel(item.reviewDecision)}</Badge></div>
          <p className="whitespace-pre-wrap break-words pt-2 text-sm leading-relaxed text-muted-foreground">{item.input}</p>
          {item.output !== null && <div className="mt-3 border-t pt-3"><p className="pb-1 text-sm font-medium">{t('节点输出', 'Node output')}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.output}</p></div>}
          {item.resultMeta && <details className="pt-2 text-sm"><summary className="cursor-pointer text-muted-foreground">{t('媒体文件元数据', 'Media metadata')}</summary><pre className="overflow-auto pt-2 text-sm">{JSON.stringify(item.resultMeta, null, 2)}</pre></details>}
          {item.errorCode && <p className="pt-2 text-sm text-muted-foreground">{errors[item.errorCode] ? t(...errors[item.errorCode]) : t('执行结果不确定', 'Uncertain execution')}</p>}
          {item.usage && <p className="pt-2 font-mono text-sm text-muted-foreground">{t('节点上报', 'Node-reported')} token: {item.usage.inputTokens} / {item.usage.outputTokens}</p>}
          <p className="py-2 text-sm text-muted-foreground">{item.billingUnits} {t('计费单位', 'billing units')}{item.reviewReason && ` · ${item.reviewReason}`}</p>
          {data.settlement === 'unverified' && item.status === 'review' && !item.reviewDecision && <ReviewControls taskId={taskId} item={item} onChanged={() => refresh()} />}
        </li>)}</ol>
        <p className="text-sm text-muted-foreground">{t('下载 JSON 只包含结果和路径，媒体成品仍在本机。', 'JSON contains results and paths only. Media artifacts stay on the node.')}</p>
        <div className="flex flex-wrap gap-2"><a href={`${url}?download=1`} className={buttonVariants({ variant: 'outline' })}><Download className="size-4" />{t('下载结果 JSON', 'Download results JSON')}</a>
          {canAcceptAll && <Button variant="strong" disabled={settling} onClick={() => setConfirmation('all')}>{data.items.some(item => item.reviewDecision === 'rejected') ? t('接受其余结果并结算', 'Accept remaining and settle') : t('全部接受并结算', 'Accept all and settle')}</Button>}
          {reviewed && <Button variant="strong" disabled={settling} onClick={() => setConfirmation('reviewed')}>{t('按核验决定完成整单处置', 'Finalize reviewed task')}</Button>}
        </div>
        {confirmation && <section className="rounded-lg border border-border p-4" aria-label={t('最终确认', 'Final confirmation')}>
          <p className="text-sm leading-relaxed">{t('确认后，接受部分按 85% / 5% / 剩余份额写入 VTEST 测试账本；拒收部分退回预算，已取消部分不会再次退款。此操作不可撤销。', 'Accepted work receives the 85% / 5% / remainder test split. Rejected work is refunded; cancelled work is not refunded twice. This action is final.')}</p>
          <div className="flex flex-wrap gap-2 pt-3"><Button disabled={settling} onClick={confirmSettlement}>{settling ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <ReceiptText data-icon="inline-start" />}{t('确认测试处置', 'Confirm test settlement')}</Button><Button variant="ghost" disabled={settling} onClick={() => setConfirmation(null)}>{t('返回检查', 'Back to review')}</Button></div>
        </section>}
      </>}
    </DialogContent></Dialog>
  </>
}
