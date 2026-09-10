'use client'

import { useRef, useState } from 'react'
import { ArrowLeft, Download, FileText, LockKeyhole, Loader2, Send, ShieldCheck, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { mutate } from 'swr'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field'
import { prepareTaskDraft } from '@/lib/venus/task-draft'
import { UNIT_PRICE, formatDisplay, multiplyStr, addStr } from '@/lib/venus/money'
import { submitTask } from '@/app/actions/tasks'
import { useWorkspace } from './workspace-context'
import { ExecutionConsent, type ExecutionChoice } from './execution-consent'

type Prepared = Extract<ReturnType<typeof prepareTaskDraft>, { ok: true }>['draft']
type TaskType = 'text' | 'video' | 'image'
type Operation = 'infer' | 'segment' | 'transcode' | 'multi_shot'

export function TaskDraftForm() {
  const { t, draft, setDraft, user, setModal } = useWorkspace()
  const [content, setContent] = useState('')
  const [concurrency, setConcurrency] = useState('2')
  const [taskType, setTaskType] = useState<TaskType>('text')
  const [operation, setOperation] = useState<Operation>('infer')
  const [workflow, setWorkflow] = useState('')
  const [error, setError] = useState('')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [execution, setExecution] = useState<ExecutionChoice>({ nodeId: '', model: '', consent: false })
  const fileInput = useRef<HTMLInputElement>(null)
  const selectClass = 'h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring'
  const billing = prepared?.items.reduce((total, item) => addStr(total, multiplyStr(UNIT_PRICE, item.billingUnits ?? 1)), '0.0000') ?? '0.0000'

  async function submit() {
    if (!prepared || submitting) return
    setSubmitting(true)
    try {
      const result = await submitTask({ instruction: prepared.instruction, content, concurrency: prepared.concurrency, taskType: prepared.taskType, operation: prepared.operation, mediaSpec: prepared.mediaSpec, requestId, execution: execution.nodeId && execution.consent ? { nodeId: execution.nodeId, model: execution.model, consent: true } : null })
      if (result.ok) {
        toast.success(t(`任务已创建，已预留 ${formatDisplay(result.reserved)} VTEST 测试预算`, `Task created. Reserved ${formatDisplay(result.reserved)} VTEST test budget.`))
        void mutate('/api/v1/tasks'); void mutate('/api/v1/wallet'); void mutate('/api/v1/ledger'); setModal(null)
      } else if (result.error === 'insufficient_budget') toast.error(t('测试预算不足。取消其他待接入任务可释放预留。', 'Insufficient test budget. Cancel pending tasks to free reservations.'))
      else if (result.error === 'invalid_node') toast.error(t('节点策略或模型已变化，请重新选择。', 'The node policy or model changed. Choose again.'))
      else toast.error(t('提交失败，请检查媒体 JSON 和路径后重试。', 'Submission failed. Check the media JSON and paths.'))
    } catch { toast.error(t('网络异常，请稍后再试。', 'Network error. Please try again.')) }
    finally { setSubmitting(false) }
  }

  function review(event: React.FormEvent) {
    event.preventDefault()
    let mediaSpec: unknown
    if (taskType === 'image') {
      try { mediaSpec = { taskType: 'image', operation: 'multi_shot', comfyWorkflow: JSON.parse(workflow), timeoutSeconds: 900 } }
      catch { setError(t('请填写有效的 ComfyUI 工作流 JSON。', 'Enter valid ComfyUI workflow JSON.')); return }
    }
    const result = prepareTaskDraft({ instruction: draft, content, concurrency: Number(concurrency), taskType, operation, mediaSpec })
    if (!result.ok) {
      const messages: Record<string, [string, string]> = {
        too_many_records: ['最多支持 1,000 条记录，请拆分后重试。', 'A maximum of 1,000 records is supported.'],
        record_too_long: ['单条记录不能超过 10,000 个字符。', 'Each record must contain at most 10,000 characters.'],
        media_line_json: ['媒体任务每行必须是有效 JSON。', 'Each media line must be valid JSON.'],
        media_line_invalid: ['媒体 JSON 字段不符合当前操作要求。', 'The media JSON does not match this operation.'],
        invalid_media_spec: ['媒体配置与任务类型不匹配。', 'The media configuration does not match the task type.'],
      }
      setError(messages[result.error]?.[0] ? t(messages[result.error][0], messages[result.error][1]) : t('请填写指令、记录，并将并行数设置为 1–8 的整数。', 'Enter instructions and records, and set concurrency from 1 to 8.'))
      return
    }
    setError(''); setPrepared(result.draft); setRequestId(crypto.randomUUID())
  }

  async function importText(file?: File) {
    if (!file) return
    if (!/\.txt$/i.test(file.name) || file.size > 300000) { setError(t('请选择 600 KB 以内的 UTF-8 TXT 文件。', 'Choose a UTF-8 TXT file under 600 KB.')); return }
    try { const text = await file.text(); if (text.length > 100000) { setError(t('文件内容不能超过 100,000 个字符。', 'The file must not exceed 100,000 characters.')); return }; setContent(text); setError(''); toast.success(t('已读取文件，仅保留在当前草稿中。', 'File loaded into this temporary draft.')) }
    catch { setError(t('无法读取文件，请重新选择。', 'Could not read this file. Please try again.')) }
    finally { if (fileInput.current) fileInput.current.value = '' }
  }

  function download() {
    if (!prepared) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(prepared, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'venus-task-draft.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(t('草稿已导出，未提交或执行任务。', 'Draft exported. No task was submitted or executed.'))
  }

  if (prepared) return <div className="flex flex-col gap-5">
    <div className="rounded-lg border bg-background p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-medium">{t('拆分预览', 'Split preview')}</h3><Badge variant="secondary">{t('未提交草稿', 'Unsubmitted draft')}</Badge></div><p className="pt-3 text-sm leading-relaxed">{prepared.instruction}</p><div className="flex flex-wrap gap-2 pt-3"><Badge variant="outline">{prepared.taskType} · {prepared.operation}</Badge><Badge variant="outline">{prepared.items.length} {t('条记录', 'records')}</Badge><Badge variant="outline">{t('服务端计费单位', 'server billing units')} {prepared.items.reduce((total, item) => total + (item.billingUnits ?? 1), 0)}</Badge></div><p className="pt-3 font-mono text-xl tabular-nums">{formatDisplay(billing)} VTEST</p></div>
    <ol className="max-h-52 overflow-auto rounded-lg border text-sm">{prepared.items.slice(0, 5).map(item => <li key={item.index} className="flex items-start gap-3 border-b px-4 py-3 last:border-0"><span className="font-mono text-muted-foreground">{item.index + 1}</span><p className="min-w-0 break-words leading-relaxed">{item.text}</p></li>)}</ol>
    {prepared.items.length > 5 && <p className="text-sm text-muted-foreground">{t('仅预览前 5 条，导出包含全部记录。', 'Previewing the first 5 records. Export includes all records.')}</p>}
    <div className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"><ShieldCheck className="size-4 shrink-0" /><p>{t('此预览不调用 AI。提交后服务端保存拆分结果并按计费单位预留预算；只有明确授权的本地节点可以执行。完成后仍需你检查全部结果，再显式确认分账。', 'This preview makes no AI calls. The server saves the split and reserves budget by billing unit; only an explicitly authorized local node can execute. After completion, review every result before explicitly settling the split.')}</p></div>
    <ExecutionConsent value={execution} onChange={setExecution} taskType={prepared.taskType} operation={prepared.operation} />
    <div className="flex flex-wrap justify-between gap-3"><Button variant="ghost" onClick={() => setPrepared(null)}><ArrowLeft data-icon="inline-start" />{t('返回编辑', 'Back to editing')}</Button><div className="flex gap-2"><Button variant="outline" onClick={download}><Download data-icon="inline-start" />{t('下载草稿 JSON', 'Download draft JSON')}</Button>{user ? <Button variant="strong" onClick={submit} disabled={submitting || (!!execution.nodeId && (!execution.consent || !execution.model))}>{submitting ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Send data-icon="inline-start" />}{submitting ? t('提交中…', 'Submitting…') : t('提交并预留预算', 'Submit and reserve')}</Button> : <div className="flex flex-col gap-2"><Button disabled variant="strong"><LockKeyhole data-icon="inline-start" />{t('提交任务 · 需先登录', 'Submit · sign in required')}</Button><a href="/sign-in" className="text-center text-sm font-medium underline underline-offset-4">{t('登录后提交', 'Sign in to submit')}</a></div>}</div></div>
  </div>

  return <form onSubmit={review}><FieldGroup>
    <Field><FieldLabel htmlFor="task-type">{t('任务类型', 'Task type')}</FieldLabel><select id="task-type" className={selectClass} value={taskType} onChange={event => { const next = event.target.value as TaskType; setTaskType(next); setOperation(next === 'text' ? 'infer' : next === 'video' ? 'segment' : 'multi_shot'); setError('') }}><option value="text">{t('文本推理', 'Text inference')}</option><option value="video">{t('视频处理（本地 ffmpeg）', 'Video processing (local ffmpeg)')}</option><option value="image">{t('多图分镜（本地 ComfyUI）', 'Storyboard images (local ComfyUI)')}</option></select><FieldDescription>{t('媒体文件留在节点本机；指令、路径、参数、模板和结果元数据会保存到平台，再转交你授权的节点。', 'Media files stay on the node. Instructions, paths, parameters, templates and result metadata are stored by the platform and sent to your authorized node.')}</FieldDescription></Field>
    {taskType !== 'text' && <Field><FieldLabel htmlFor="task-operation">{t('媒体操作', 'Media operation')}</FieldLabel><select id="task-operation" className={selectClass} value={operation} onChange={event => setOperation(event.target.value as Operation)}>{taskType === 'video' ? <><option value="segment">{t('按时间切段', 'Segment by time')}</option><option value="transcode">{t('转码', 'Transcode')}</option></> : <option value="multi_shot">{t('逐条生成分镜图', 'Generate one storyboard image per line')}</option>}</select></Field>}
    {taskType === 'image' && <Field><FieldLabel htmlFor="comfy-workflow">ComfyUI API 工作流 JSON</FieldLabel><Textarea id="comfy-workflow" value={workflow} onChange={event => setWorkflow(event.target.value)} placeholder="粘贴 ComfyUI Save (API Format) 导出的 JSON" required className="min-h-28 font-mono text-xs" /><FieldDescription>{t('此 JSON 必须与前台节点本地批准模板的 workflow 哈希一致；仅按本地明确映射写入 prompt、seed、宽高。outputDir 必须已存在且在授权根目录内。', 'This JSON must match the locally approved template workflow hash. Only explicitly mapped prompt, seed and dimensions are changed. outputDir must exist within the approved root.')}</FieldDescription></Field>}
    <Field><FieldLabel htmlFor="task-instruction">{t('执行说明', 'Instruction')}</FieldLabel><Textarea id="task-instruction" value={draft} onChange={event => setDraft(event.target.value)} placeholder={taskType === 'text' ? t('例如：将每条产品介绍翻译成英文。', 'For example: translate each product description into English.') : t('说明媒体处理目标和命名约定。', 'Describe the media operation and naming convention.')} required maxLength={2000} className="min-h-20" /></Field>
    <Field data-invalid={!!error}><div className="flex items-center justify-between"><FieldLabel htmlFor="task-content">{taskType === 'text' ? t('待处理文本', 'Text to process') : taskType === 'video' ? t('视频参数 JSON（每行一条）', 'Video parameter JSON (one per line)') : t('分镜 JSON（每行一条）', 'Shot JSON (one per line)')}</FieldLabel><Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()}><Upload data-icon="inline-start" />{t('导入 TXT', 'Import TXT')}</Button><input ref={fileInput} type="file" accept=".txt,text/plain" className="hidden" onChange={event => void importText(event.target.files?.[0])} aria-label={t('选择文本文件', 'Choose text file')} /></div><Textarea id="task-content" value={content} onChange={event => setContent(event.target.value)} placeholder={taskType === 'text' ? t('每行一条记录。', 'One record per line.') : taskType === 'video' ? t('{"inputPath":"/素材/a.mp4","outputPath":"/素材/a-01.mp4","startSeconds":0,"durationSeconds":10}', '{"inputPath":"/media/a.mp4","outputPath":"/media/a-01.mp4","startSeconds":0,"durationSeconds":10}') : t('{"prompt":"城市夜景","outputDir":"/素材/分镜","fileName":"shot-01.png"}', '{"prompt":"city at night","outputDir":"/media/storyboard","fileName":"shot-01.png"')} required maxLength={100000} aria-invalid={!!error} className="min-h-40 font-mono text-xs" /><FieldDescription>{t('最多 1,000 条；媒体路径必须是节点本机绝对路径。', 'Up to 1,000 lines; media paths must be absolute paths on the node.')}</FieldDescription>{error && <FieldError>{error}</FieldError>}</Field>
    <Field><FieldLabel htmlFor="task-concurrency">{t('期望并行数', 'Requested concurrency')}</FieldLabel><Input id="task-concurrency" type="number" min={1} max={8} step={1} required value={concurrency} onChange={event => setConcurrency(event.target.value)} /><FieldDescription>{t('实际并行数受节点资源策略限制。', 'Actual concurrency is limited by the node resource policy.')}</FieldDescription></Field>
    <p className="text-sm leading-relaxed text-muted-foreground">{t('草稿不会自动保存。下一步只做本地校验和拆分预览，不会调用 AI 或执行本机命令。', 'Drafts are not saved automatically. The next step only validates and previews the split; it does not call AI or run local commands.')}</p>
    <Button type="submit" variant="strong"><FileText data-icon="inline-start" />{t('校验并预览拆分', 'Validate and preview split')}</Button>
  </FieldGroup></form>
}
