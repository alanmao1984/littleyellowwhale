'use client'

import { useWorkspace } from './workspace-context'

function lines(value: string | null | undefined) {
  return value?.split(/\r?\n/) ?? []
}

export function CockpitDiff({ before, after }: { before: string; after: string | null }) {
  const { t } = useWorkspace()
  const beforeLines = lines(before)
  const afterLines = lines(after)
  const count = Math.max(beforeLines.length, afterLines.length)

  if (!after) return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t('节点输出到达后，这里会生成可审查的前后对照。', 'A reviewable before-and-after comparison will appear when node output arrives.')}</p>

  return <div className="grid gap-3 md:grid-cols-2" aria-label={t('输入输出差异', 'Input and output diff')}>
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <header className="border-b border-border px-3 py-2 font-mono text-sm text-muted-foreground">{t('输入', 'Input')}</header>
      <ol className="max-h-72 overflow-auto py-2 font-mono text-sm leading-6">
        {Array.from({ length: count }, (_, index) => <li key={index} className="grid grid-cols-[2rem_1fr] px-3"><span className="select-none text-muted-foreground">−</span><span className="whitespace-pre-wrap break-words">{beforeLines[index] ?? ' '}</span></li>)}
      </ol>
    </section>
    <section className="overflow-hidden rounded-lg border border-primary bg-secondary">
      <header className="border-b border-primary px-3 py-2 font-mono text-sm text-foreground">{t('节点输出', 'Node output')}</header>
      <ol className="max-h-72 overflow-auto py-2 font-mono text-sm leading-6">
        {Array.from({ length: count }, (_, index) => <li key={index} className="grid grid-cols-[2rem_1fr] px-3"><span className="select-none text-foreground">+</span><span className="whitespace-pre-wrap break-words">{afterLines[index] ?? ' '}</span></li>)}
      </ol>
    </section>
  </div>
}
