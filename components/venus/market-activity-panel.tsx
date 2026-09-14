'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Activity, AlertCircle, BadgeCheck, FlaskConical, Loader2, Plus, Send, Undo2, Pencil, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageHeading } from './workspace'
import { useWorkspace } from './workspace-context'
import { fetchJson, pollingConfig } from '@/lib/venus/request'

const fetcher = fetchJson

type Source = 'real' | 'demo'
type FeedItem = {
  id: string
  source: Source
  eventType: 'text_completion'
  model: string
  inputTokens: number
  outputTokens: number
  settledAmount: string
  latencyMs: number | null
  currency: 'VTEST'
  occurredAt: string
  titleZh?: string
  titleEn?: string
  summaryZh?: string
  summaryEn?: string
}
type Feed = { items: FeedItem[]; realCount: number; demoCount: number; limit: number; disclosure: { zh: string; en: string } }
type DemoStatus = 'draft' | 'published' | 'withdrawn'
type AdminDemo = {
  id: string
  status: DemoStatus
  titleZh: string
  titleEn: string
  summaryZh: string
  summaryEn: string
  model: string
  inputTokens: number
  outputTokens: number
  settledAmount: string
  latencyMs: number | null
  occurredAt: string
  updatedAt: string
}

const emptyForm = { titleZh: '', titleEn: '', summaryZh: '', summaryEn: '', model: '', inputTokens: '0', outputTokens: '0', settledAmount: '0.0000', latencyMs: '', occurredAt: '' }
type FormState = typeof emptyForm

// datetime-local yields 'YYYY-MM-DDTHH:mm' in local time; convert to a full ISO
// timestamp (with timezone) so the server-side z.string().datetime() accepts it.
function toIso(local: string): string | null {
  if (!local) return null
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

// ISO -> value for <input type="datetime-local"> in the viewer's local time.
function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function MarketActivityPanel() {
  const { t, locale, user } = useWorkspace()
  const { data, error, isLoading } = useSWR<Feed>('/api/v1/market-activity', fetcher, { ...pollingConfig, refreshInterval: 15000 })
  const { data: me } = useSWR<{ platformAdmin: boolean }>(user ? '/api/v1/platform/me' : null, fetcher, pollingConfig)
  const isAdmin = !!me?.platformAdmin

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }), [locale])
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US'), [locale])

  return (
    <div className="content-enter">
      <PageHeading
        title={t('市场动态', 'Market activity')}
        subtitle={t('公开透明的算力成交时间流，任何访客都可查看脱敏后的真实结算。', 'A public, transparent stream of compute settlements that any visitor can view, with sensitive data removed.')}
        action={<Badge variant="secondary">{t('公开只读', 'Public read-only')}</Badge>}
      />

      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary p-4 text-sm leading-relaxed">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium text-foreground">{t('真实交易优先，演示内容仅补位', 'Real transactions first; demo content only backfills')}</p>
            <p className="pt-1 text-muted-foreground">{data ? (locale === 'zh' ? data.disclosure.zh : data.disclosure.en) : t('演示内容不参与结算、钱包、任务或供给统计。', 'Demo content never affects settlement, wallets, tasks, or provider stats.')}</p>
          </div>
        </div>

        {isAdmin && <OperatorControls t={t} />}

        <section className="panel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <div className="flex items-center gap-2">
              <h2 className="section-heading">{t('成交时间流', 'Settlement stream')}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1"><BadgeCheck className="size-3.5" />{t('真实', 'Real')} {data?.realCount ?? 0}</Badge>
              <Badge variant="outline" className="gap-1 border-dashed"><FlaskConical className="size-3.5" />{t('演示', 'Demo')} {data?.demoCount ?? 0}</Badge>
            </div>
          </div>

          {isLoading ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />{t('正在读取市场动态…', 'Loading market activity…')}</div>
          ) : error ? (
            <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><AlertCircle /></EmptyMedia><EmptyTitle>{t('暂时无法加载动态', 'Activity is unavailable')}</EmptyTitle><EmptyDescription>{t('稍后会自动重试，请检查网络或稍候刷新。', 'It will retry automatically — check your connection or refresh shortly.')}</EmptyDescription></EmptyHeader></Empty>
          ) : !data?.items.length ? (
            <Empty className="min-h-48"><EmptyHeader><EmptyMedia variant="icon"><Activity /></EmptyMedia><EmptyTitle>{t('还没有可展示的成交', 'No settlements to show yet')}</EmptyTitle><EmptyDescription>{t('一旦有真实 API 结算或已发布的演示动态，这里会按时间倒序展示。', 'Once there are real API settlements or published demo entries, they appear here newest-first.')}</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <ul className="divide-y">
              {data.items.map(item => {
                const title = item.source === 'demo' ? (locale === 'zh' ? item.titleZh : item.titleEn) : t('真实文本补全结算', 'Real text completion settlement')
                const summary = item.source === 'demo' ? (locale === 'zh' ? item.summaryZh : item.summaryEn) : t('跨用户撮合的真实节点调用，已按用量完成 VTEST 结算。', 'A cross-user real node call, settled in VTEST by actual usage.')
                return (
                  <li key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {item.source === 'real' ? (
                          <Badge className="gap-1"><BadgeCheck className="size-3.5" />{t('真实结算', 'Real settlement')}</Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-dashed border-amber-500/60 text-amber-700 dark:text-amber-400"><FlaskConical className="size-3.5" />{t('演示数据', 'Demo data')}</Badge>
                        )}
                        <span className="font-mono text-sm text-muted-foreground">{item.model}</span>
                      </div>
                      <p className="pt-2 text-sm font-medium text-pretty">{title}</p>
                      <p className="pt-1 text-sm leading-relaxed text-muted-foreground text-pretty">{summary}</p>
                      <p className="pt-1.5 text-sm text-muted-foreground">
                        {dateFormatter.format(new Date(item.occurredAt))} · {t('输入', 'in')} {numberFormatter.format(item.inputTokens)} / {t('输出', 'out')} {numberFormatter.format(item.outputTokens)} tokens{item.latencyMs != null ? ` · ${numberFormatter.format(item.latencyMs)} ms` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="font-mono text-base font-semibold">{item.settledAmount}</p>
                      <p className="text-sm text-muted-foreground">{item.currency}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function OperatorControls({ t }: { t: (zh: string, en: string) => string }) {
  const { data, mutate } = useSWR<{ demos: AdminDemo[] }>('/api/v1/platform/market-demos', fetcher, pollingConfig)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(prev => ({ ...prev, [key]: event.target.value }))

  function reset() {
    setForm(emptyForm)
    setEditingId(null)
  }

  function buildPayload() {
    const occurredAt = toIso(form.occurredAt)
    if (!occurredAt) return null
    const inputTokens = Number(form.inputTokens)
    const outputTokens = Number(form.outputTokens)
    const latencyMs = form.latencyMs.trim() === '' ? null : Number(form.latencyMs)
    if (![inputTokens, outputTokens].every(Number.isInteger) || (latencyMs !== null && !Number.isInteger(latencyMs))) return null
    return {
      titleZh: form.titleZh.trim(),
      titleEn: form.titleEn.trim(),
      summaryZh: form.summaryZh.trim(),
      summaryEn: form.summaryEn.trim(),
      model: form.model.trim(),
      inputTokens,
      outputTokens,
      settledAmount: form.settledAmount.trim(),
      latencyMs,
      occurredAt,
    }
  }

  async function submit() {
    const payload = buildPayload()
    if (!payload) return toast.error(t('请填写完整字段，并确认时间与数值有效。', 'Fill every field and make sure the time and numbers are valid.'))
    setBusy(true)
    try {
      const response = editingId
        ? await fetch(`/api/v1/platform/market-demos/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', data: payload }) })
        : await fetch('/api/v1/platform/market-demos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? 'failed')
      toast.success(editingId ? t('演示动态已更新为草稿。', 'Demo entry updated as a draft.') : t('演示动态已创建为草稿。', 'Demo entry created as a draft.'))
      reset()
      void mutate()
    } catch {
      toast.error(t('保存失败，请确认权限、时间范围与字段。', 'Save failed — check your permission, time range, and fields.'))
    } finally {
      setBusy(false)
    }
  }

  async function act(id: string, action: 'publish' | 'withdraw') {
    setBusy(true)
    try {
      const response = await fetch(`/api/v1/platform/market-demos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? 'failed')
      toast.success(action === 'publish' ? t('演示动态已发布到公开时间流。', 'Demo entry published to the public stream.') : t('演示动态已从公开时间流撤下。', 'Demo entry withdrawn from the public stream.'))
      void mutate()
    } catch {
      toast.error(t('操作失败或状态不允许该转换。', 'Action failed or the status transition is not allowed.'))
    } finally {
      setBusy(false)
    }
  }

  function startEdit(demo: AdminDemo) {
    setEditingId(demo.id)
    setForm({
      titleZh: demo.titleZh,
      titleEn: demo.titleEn,
      summaryZh: demo.summaryZh,
      summaryEn: demo.summaryEn,
      model: demo.model,
      inputTokens: String(demo.inputTokens),
      outputTokens: String(demo.outputTokens),
      settledAmount: demo.settledAmount,
      latencyMs: demo.latencyMs == null ? '' : String(demo.latencyMs),
      occurredAt: toLocalInput(demo.occurredAt),
    })
  }

  const statusLabel: Record<DemoStatus, string> = {
    draft: t('草稿', 'Draft'),
    published: t('已发布', 'Published'),
    withdrawn: t('已撤下', 'Withdrawn'),
  }

  return (
    <section className="panel p-5">
      <div className="flex items-center gap-3 pb-1">
        <span className="flex size-9 items-center justify-center rounded-lg bg-secondary"><ShieldCheck className="size-5" /></span>
        <div>
          <h2 className="section-heading">{t('运营控制区', 'Operator controls')}</h2>
          <p className="text-sm text-muted-foreground">{t('仅平台管理员可见；演示动态始终醒目标注且不影响真实结算。', 'Visible to platform admins only; demo entries stay clearly labelled and never affect real settlement.')}</p>
        </div>
      </div>

      <div className="grid gap-6 pt-5 xl:grid-cols-[1fr_1fr]">
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="demo-title-zh">{t('中文标题', 'Chinese title')}</FieldLabel><Input id="demo-title-zh" value={form.titleZh} onChange={set('titleZh')} maxLength={60} /></Field>
            <Field><FieldLabel htmlFor="demo-title-en">{t('英文标题', 'English title')}</FieldLabel><Input id="demo-title-en" value={form.titleEn} onChange={set('titleEn')} maxLength={80} /></Field>
          </div>
          <Field><FieldLabel htmlFor="demo-summary-zh">{t('中文摘要', 'Chinese summary')}</FieldLabel><Textarea id="demo-summary-zh" value={form.summaryZh} onChange={set('summaryZh')} maxLength={240} rows={2} /></Field>
          <Field><FieldLabel htmlFor="demo-summary-en">{t('英文摘要', 'English summary')}</FieldLabel><Textarea id="demo-summary-en" value={form.summaryEn} onChange={set('summaryEn')} maxLength={320} rows={2} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="demo-model">{t('模型名', 'Model')}</FieldLabel><Input id="demo-model" value={form.model} onChange={set('model')} placeholder="whale-qwen-7b" /></Field>
            <Field><FieldLabel htmlFor="demo-occurred">{t('发生时间', 'Occurred at')}</FieldLabel><Input id="demo-occurred" type="datetime-local" value={form.occurredAt} onChange={set('occurredAt')} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="demo-input">{t('输入 tokens', 'Input tokens')}</FieldLabel><Input id="demo-input" value={form.inputTokens} onChange={set('inputTokens')} inputMode="numeric" /></Field>
            <Field><FieldLabel htmlFor="demo-output">{t('输出 tokens', 'Output tokens')}</FieldLabel><Input id="demo-output" value={form.outputTokens} onChange={set('outputTokens')} inputMode="numeric" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="demo-amount">{t('结算额 (VTEST)', 'Settled (VTEST)')}</FieldLabel><Input id="demo-amount" value={form.settledAmount} onChange={set('settledAmount')} inputMode="decimal" /></Field>
            <Field><FieldLabel htmlFor="demo-latency">{t('耗时 ms（可选）', 'Latency ms (optional)')}</FieldLabel><Input id="demo-latency" value={form.latencyMs} onChange={set('latencyMs')} inputMode="numeric" /></Field>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={submit} disabled={busy}>{busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : editingId ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}{editingId ? t('保存修改', 'Save changes') : t('新增草稿', 'Add draft')}</Button>
            {editingId && <Button variant="outline" onClick={reset} disabled={busy}>{t('取消编辑', 'Cancel edit')}</Button>}
          </div>
        </FieldGroup>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-medium">{t('演示动态列表', 'Demo entries')}</h3><Badge variant="outline">{data?.demos.length ?? 0}</Badge></div>
          {!data?.demos.length ? (
            <Empty className="min-h-40 rounded-lg border border-dashed"><EmptyHeader><EmptyTitle>{t('还没有演示动态', 'No demo entries yet')}</EmptyTitle><EmptyDescription>{t('创建草稿并发布后，它才会补位到公开时间流。', 'Create a draft and publish it to backfill the public stream.')}</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <ul className="flex max-h-[520px] flex-col gap-3 overflow-y-auto pr-1">
              {data.demos.map(demo => (
                <li key={demo.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant={demo.status === 'published' ? 'default' : 'outline'} className={demo.status === 'draft' ? 'border-dashed' : undefined}>{statusLabel[demo.status]}</Badge>
                    <span className="font-mono text-sm text-muted-foreground">{demo.model}</span>
                  </div>
                  <p className="pt-2 text-sm font-medium">{demo.titleZh}</p>
                  <p className="pt-0.5 text-sm text-muted-foreground">{demo.settledAmount} VTEST · {new Date(demo.occurredAt).toLocaleString('zh-CN')}</p>
                  <div className="flex flex-wrap gap-2 pt-3">
                    {demo.status !== 'published' && <Button size="sm" onClick={() => act(demo.id, 'publish')} disabled={busy}><Send data-icon="inline-start" />{t('发布', 'Publish')}</Button>}
                    {demo.status === 'published' && <Button size="sm" variant="outline" onClick={() => act(demo.id, 'withdraw')} disabled={busy}><Undo2 data-icon="inline-start" />{t('撤下', 'Withdraw')}</Button>}
                    {demo.status !== 'published' && <Button size="sm" variant="outline" onClick={() => startEdit(demo)} disabled={busy}><Pencil data-icon="inline-start" />{t('编辑', 'Edit')}</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
