'use client'

import { useState } from 'react'
import { Settings2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field'
import { saveNodePolicy } from '@/app/actions/nodes'
import { resourcePolicySchema, capabilitySchema } from '@/packages/node-protocol'
import type { NodeView } from '@/lib/venus/nodes'
import { useWorkspace } from './workspace-context'

export function NodePolicyForm({ node, onChanged }: { node: NodeView; onChanged: () => void }) {
  const { t } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [policy, setPolicy] = useState(node.policy)
  const [models, setModels] = useState(node.policy.allowedModels.join('\n'))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  async function save(event: React.FormEvent) {
    event.preventDefault()
    const parsed = resourcePolicySchema.safeParse({ ...policy, allowedModels: models.split(/\r?\n/).map(m => m.trim()).filter(Boolean) })
    if (!parsed.success) { setError(t('请检查模型名称、并发数和时区；开启接单至少需要一个模型。', 'Check models, concurrency and time zone. At least one model is required to accept work.')); return }
    setPending(true); setError('')
    try {
      const result = await saveNodePolicy(node.id, parsed.data)
      if (!result.ok) { setError(t('策略未保存，节点可能已撤销。', 'Policy not saved. The node may be revoked.')); return }
      onChanged(); setOpen(false); toast.success(t('资源策略已保存', 'Resource policy saved'))
    } catch { setError(t('保存失败，请稍后重试。', 'Could not save. Please try again.')) }
    finally { setPending(false) }
  }
  return <>
    <Button variant="outline" size="sm" onClick={() => { setPolicy(node.policy); setModels(node.policy.allowedModels.join('\n')); setError(''); setOpen(true) }}><Settings2 data-icon="inline-start" />{t('资源策略', 'Resource policy')}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{t('资源策略', 'Resource policy')} · {node.name}</DialogTitle><DialogDescription>{t('仅接收你在平台内明确授权的自有节点任务。新节点默认不接单。', 'Only accepts explicitly authorized tasks for your own node. New nodes accept no work by default.')}</DialogDescription></DialogHeader>
      <form onSubmit={save}><FieldGroup>
        <fieldset className="flex flex-col gap-3"><legend className="text-sm font-medium">{t('允许的任务能力（同时要求本机授权）', 'Allowed capabilities (local consent also required)')}</legend>
          {capabilitySchema.options.map(capability => <Field key={capability} orientation="horizontal"><input type="checkbox" id={`${node.id}-${capability}`} className="size-4 accent-primary" checked={policy.allowedCapabilities.includes(capability)} disabled={!node.capabilities.includes(capability)} onChange={event => setPolicy({ ...policy, allowedCapabilities: event.target.checked ? [...policy.allowedCapabilities, capability] : policy.allowedCapabilities.filter(value => value !== capability) })} /><FieldLabel htmlFor={`${node.id}-${capability}`}>{capability}{!node.capabilities.includes(capability) && t(' · 本机未开放', ' · not enabled locally')}</FieldLabel></Field>)}
        </fieldset>
        <Field orientation="horizontal"><input id={`enabled-${node.id}`} type="checkbox" checked={policy.enabled} onChange={e => setPolicy({ ...policy, enabled: e.target.checked })} className="size-4 accent-primary" /><FieldLabel htmlFor={`enabled-${node.id}`}>{t('允许此节点领取任务', 'Allow this node to claim tasks')}</FieldLabel></Field>
        <Field><FieldLabel htmlFor={`models-${node.id}`}>{t('允许的模型 · 每行一个', 'Allowed models · one per line')}</FieldLabel><Textarea id={`models-${node.id}`} value={models} onChange={e => setModels(e.target.value)} maxLength={4000} placeholder="qwen2.5:7b" className="font-mono" /><FieldDescription>{node.models.length ? t(`最近上报：${node.models.join('、')}`, `Last reported: ${node.models.join(', ')}`) : t('尚无设备上报的模型。模型名称必须与本机完全一致。', 'No reported models yet. Names must exactly match the local service.')}</FieldDescription></Field>
        <Field><FieldLabel htmlFor={`slots-${node.id}`}>{t('最多同时执行', 'Maximum concurrent executions')}</FieldLabel><Input id={`slots-${node.id}`} type="number" required min={1} max={8} value={policy.maxConcurrency} onChange={e => setPolicy({ ...policy, maxConcurrency: Number(e.target.value) })} /><FieldDescription>{t('平台与节点双重限制；不代表 GPU 显存或功耗已被隔离。', 'Enforced by platform and runtime; this does not isolate GPU memory or power.')}</FieldDescription></Field>
        <Field><FieldLabel htmlFor={`zone-${node.id}`}>{t('接单时区', 'Schedule time zone')}</FieldLabel><Input id={`zone-${node.id}`} value={policy.timeZone} required maxLength={80} onChange={e => setPolicy({ ...policy, timeZone: e.target.value })} placeholder="Asia/Shanghai" /></Field>
        <div className="grid grid-cols-2 gap-4"><Field><FieldLabel htmlFor={`start-${node.id}`}>{t('开始', 'Start')}</FieldLabel><Input id={`start-${node.id}`} type="time" required value={policy.start} onChange={e => setPolicy({ ...policy, start: e.target.value })} /></Field><Field><FieldLabel htmlFor={`end-${node.id}`}>{t('结束', 'End')}</FieldLabel><Input id={`end-${node.id}`} type="time" required value={policy.end} onChange={e => setPolicy({ ...policy, end: e.target.value })} /></Field></div>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('起止相同表示全天，支持跨午夜。暂停、策略变更和时段结束会在下一次续租时请求中止；未确认中止的用量保留待核验。', 'Equal start and end means all day. Overnight windows are supported. Pauses, policy changes and schedule boundaries request abort at renewal; uncertain usage remains under review.')}</p>
        {error && <FieldError>{error}</FieldError>}<Button type="submit" disabled={pending}>{pending && <Loader2 data-icon="inline-start" className="animate-spin" />}{t('保存资源策略', 'Save resource policy')}</Button>
      </FieldGroup></form>
    </DialogContent></Dialog>
  </>
}
