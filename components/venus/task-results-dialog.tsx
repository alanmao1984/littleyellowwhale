'use client'

import { useState } from 'react'
import useSWR, { mutate as mutateCache } from 'swr'
import { Download, FileText, Loader2, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { settleTask } from '@/app/actions/tasks'
import { useWorkspace } from './workspace-context'
import type { getTaskResults } from '@/lib/venus/execution'

type Results = NonNullable<Awaited<ReturnType<typeof getTaskResults>>>
const errors: Record<string, [string, string]> = { lease_expired: ['租约已过期，执行结果不确定', 'Lease expired; execution outcome uncertain'], cancel_requested: ['已请求中止，等待用量核验', 'Abort requested; usage awaits review'], inference_error: ['本机推理异常，未自动重试', 'Local inference error; no automatic retry'], media_error: ['本机媒体处理异常，未自动重试', 'Local media processing error; no automatic retry'], policy_changed: ['资源策略已变化', 'Resource policy changed'], shutdown: ['节点已退出', 'Runtime stopped'], lease_lost: ['续租失败，已请求中止', 'Renewal failed; abort requested'] }

export function TaskResultsDialog({ taskId }: { taskId: string }) {
  const { t } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [settling, setSettling] = useState(false)
  const url = `/api/v1/tasks/${taskId}/results`
  const { data, error, isLoading, mutate: refresh } = useSWR<Results>(open ? url : null, async requestUrl => {
    const response = await fetch(requestUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error('request_failed')
    return response.json()
  }, { refreshInterval: open ? 5000 : 0 })
  const count = (status: string) => data?.items.filter(i => i.status === status).length ?? 0
  const readyToSettle = !!data && data.settlement === 'unverified' && data.status === 'review' && data.items.length > 0 && data.items.every(item => item.status === 'review' && !!item.output)
  async function confirmSettlement() {
    if (!readyToSettle || settling) return
    setSettling(true)
    try {
      const result = await settleTask(taskId)
      if (result.ok) {
        toast.success(t(`已确认分账：供给方 ${result.provider}，经纪 ${result.broker}，平台 ${result.platform} VTEST。`, `Settlement confirmed: provider ${result.provider}, broker ${result.broker}, platform ${result.platform} VTEST.`))
        await refresh(); void mutateCache('/api/v1/tasks'); void mutateCache('/api/v1/wallet'); void mutateCache('/api/v1/ledger')
      } else toast.error(t('结果尚未满足分账条件，请检查全部记录。', 'The result is not ready for settlement. Review every record.'))
    } catch { toast.error(t('分账失败，请稍后重试。', 'Settlement failed. Please try again.')) }
    finally { setSettling(false) }
  }
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}><FileText data-icon="inline-start" />{t('进度与结果', 'Progress & results')}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t('任务进度与结果', 'Task progress & results')}</DialogTitle><DialogDescription>{t('按原始顺序展示节点回传。结果和用量未经独立核验；只有你检查全部结果并确认后，才会按 85% / 5% / 10% 写入测试账本。', 'Node-reported results in original order. Output and usage are not independently verified; only your explicit confirmation writes the 85% / 5% / 10% split to the test ledger.')}</DialogDescription></DialogHeader>
      {isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t('读取中…', 'Loading…')}</p>}
      {error && <p role="alert" className="text-sm text-muted-foreground">{t('无法读取结果，请稍后再试。', 'Could not load results. Please try again.')}</p>}
      {data && <><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t(`待领取 ${count('pending')}`, `Pending ${count('pending')}`)}</Badge><Badge variant="outline">{t(`执行中 ${count('running')}`, `Running ${count('running')}`)}</Badge><Badge variant="secondary">{t(`待核验 ${count('review')}`, `Review ${count('review')}`)}</Badge><Badge variant="outline">{t(`已取消 ${count('cancelled')}`, `Cancelled ${count('cancelled')}`)}</Badge><Badge variant={data.settlement === 'settled' ? 'secondary' : 'outline'}><ReceiptText className="mr-1 size-3" />{data.settlement === 'settled' ? t('已分账', 'Settled') : t('未分账', 'Unsettled')}</Badge></div>
        <p className="break-words text-sm text-muted-foreground">{data.taskType} · {data.operation} · {data.nodeName ?? t('未授权执行', 'Execution not authorized')}{data.model && ` · ${data.model}`}</p>
        <ol className="flex flex-col gap-3">{data.items.map(item => <li key={item.index} className="rounded-lg border bg-background p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{t(`记录 ${item.index + 1}`, `Record ${item.index + 1}`)}</p><Badge variant="outline">{t(`${item.billingUnits ?? 1} 计费单位`, `${item.billingUnits ?? 1} units`)}</Badge></div><p className="whitespace-pre-wrap break-words pt-2 text-sm leading-relaxed text-muted-foreground">{item.input}</p>{item.output !== null && <div className="mt-3 border-t pt-3"><p className="pb-1 text-sm font-medium">{t('节点输出 · 待核验', 'Node output · unverified')}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.output}</p></div>}{item.resultMeta && <details className="pt-2 text-sm"><summary className="cursor-pointer text-muted-foreground">{t('媒体文件元数据', 'Media file metadata')}</summary><pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(item.resultMeta, null, 2)}</pre></details>}{item.errorCode && <p className="pt-2 text-sm text-muted-foreground">{errors[item.errorCode] ? t(...errors[item.errorCode]) : t('执行结果待核验', 'Execution requires review')}</p>}{item.usage && <p className="pt-2 font-mono text-sm text-muted-foreground">{t('节点上报', 'Node-reported')} token: {item.usage.inputTokens} / {item.usage.outputTokens}</p>}</li>)}</ol>
        <div className="flex flex-wrap gap-2"><a href={`${url}?download=1`} className={buttonVariants({ variant: 'outline' })}><Download className="size-4" />{t('下载结果 JSON', 'Download results JSON')}</a>{readyToSettle && <Button variant="strong" onClick={confirmSettlement} disabled={settling}>{settling ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <ReceiptText data-icon="inline-start" />}{t('确认结果并分账', 'Confirm and settle')}</Button>}</div></>}
    </DialogContent></Dialog></>
}
