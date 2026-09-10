'use client'

import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { useNodes } from '@/lib/venus/use-workspace-data'
import { useWorkspace } from './workspace-context'
import { supportsWork } from '@/packages/node-protocol'

export type ExecutionChoice = { nodeId: string; model: string; consent: boolean }
export function ExecutionConsent({ value, onChange, taskType, operation }: { value: ExecutionChoice; onChange: (value: ExecutionChoice) => void; taskType: string; operation: string }) {
  const { user, t } = useWorkspace()
  const { nodes, nodesLoading, nodesError } = useNodes(!!user)
  const eligible = (nodes ?? []).filter(n => n.status !== 'revoked' && n.policy.enabled && supportsWork(n.capabilities, taskType, operation) && supportsWork(n.policy.allowedCapabilities, taskType, operation))
  const selected = eligible.find(n => n.id === value.nodeId)
  const models = selected?.policy.allowedModels.filter(m => selected.models.includes(m)) ?? []
  const selectClass = 'h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring'
  return <FieldGroup>
    <Field><FieldLabel htmlFor="execution-node">{t('执行节点', 'Execution node')}</FieldLabel><select id="execution-node" className={selectClass} value={value.nodeId} onChange={e => onChange({ nodeId: e.target.value, model: '', consent: false })} disabled={!user || nodesLoading}>
      <option value="">{t('暂不授权执行 · 仅预留预算', 'No execution authorization · reserve only')}</option>
      {eligible.map(n => <option key={n.id} value={n.id}>{n.name} · {n.online ? t('在线', 'online') : t('离线', 'offline')}</option>)}
    </select><FieldDescription>{nodesError ? t('节点读取失败，请刷新后重试。', 'Could not load nodes. Refresh to retry.') : t('只可选择自有且已配置资源策略的节点，不发送到第三方或云端模型。', 'Only your own nodes with a configured policy. No third-party or cloud model fallback.')}</FieldDescription></Field>
    {value.nodeId && <><Field><FieldLabel htmlFor="execution-model">{t('固定模型', 'Pinned model')}</FieldLabel><select id="execution-model" className={selectClass} value={value.model} onChange={e => onChange({ ...value, model: e.target.value, consent: false })}><option value="">{t('选择允许且已上报的模型', 'Choose an allowed, reported model')}</option>{models.map(m => <option key={m} value={m}>{m}</option>)}</select><FieldDescription>{t('每条输出上限 1,024 token；平台不会自动更换节点或模型。', 'Output limit: 1,024 tokens per record. The platform never switches nodes or models automatically.')}</FieldDescription></Field>
      <Field orientation="horizontal"><input id="execution-consent" type="checkbox" className="size-4 shrink-0 accent-primary" checked={value.consent} disabled={!value.model || !selected} onChange={e => onChange({ ...value, consent: e.target.checked })} /><FieldLabel htmlFor="execution-consent">{t('我同意把指令和全部记录发送到上述节点，并允许节点按资源策略执行。', 'I consent to sending the instruction and all records to this node for execution under its resource policy.')}</FieldLabel></Field>
    </>}
  </FieldGroup>
}
