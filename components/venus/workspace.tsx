'use client'

import Link from 'next/link'
import { LayoutDashboard, ListTodo, Cpu, Server, Wallet, Braces, Settings, Waves, ChevronRight, ArrowUpRight, BookOpen, Globe2, Bell, CircleHelp, UserRound, Menu, X, Plus, FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { WorkspaceProvider, useWorkspace, type Locale, type Section, type SessionUser } from './workspace-context'
import { Overview } from './overview'
import { TasksPanel, ComputePanel, EarningsPanel } from './resource-panels'
import { NodesPanel, DevelopersPanel, SettingsPanel } from './connection-panels'
import { WorkspaceDialogs } from './workspace-dialogs'

const navigation = [
  { id: 'overview', zh: '总览', en: 'Overview', icon: LayoutDashboard, href: '/' },
  { id: 'tasks', zh: '任务中心', en: 'Tasks', icon: ListTodo, href: '/tasks' },
  { id: 'compute', zh: '算力池', en: 'Compute pool', icon: Cpu, href: '/compute' },
  { id: 'nodes', zh: '我的节点', en: 'My nodes', icon: Server, href: '/nodes' },
  { id: 'earnings', zh: '收益账本', en: 'Earnings', icon: Wallet, href: '/earnings' },
  { id: 'developers', zh: '开发者 / MCP', en: 'Developers / MCP', icon: Braces, href: '/developers' },
  { id: 'settings', zh: '设置', en: 'Settings', icon: Settings, href: '/settings' },
] as const

function Brand() {
  return <Link href="/" aria-label="小黄鲸 Venus" className="flex items-center gap-2.5"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Waves className="size-7" strokeWidth={1.8} /></span><span className="flex flex-col"><span className="text-lg font-bold tracking-wide">小黄鲸<span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">Venus</span></span><span className="text-sm text-muted-foreground">分布式 AI 算力网络</span></span></Link>
}

function WorkspaceShell({ section }: { section: Section }) {
  const { t, locale, setLocale, setModal, status, statusError, user } = useWorkspace()
  const [menuOpen, setMenuOpen] = useState(false)
  const active = navigation.find(item => item.id === section)!
  const sectionPanels = { overview: <Overview />, tasks: <TasksPanel />, compute: <ComputePanel />, nodes: <NodesPanel />, earnings: <EarningsPanel />, developers: <DevelopersPanel />, settings: <SettingsPanel /> }
  const dbLabel = statusError ? t('连接检测不可用', 'Check unavailable') : !status ? t('正在检查连接', 'Checking connection') : status.database === 'connected' ? t('数据库已连接', 'Database connected') : t('数据连接待就绪', 'Database pending')
  return <div className="min-h-dvh">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:p-3">{t('跳转到主要内容', 'Skip to content')}</a>
    <aside className={cn('fixed inset-y-0 left-0 z-40 w-64 flex-col border-r bg-card text-card-foreground xl:flex', menuOpen ? 'flex' : 'hidden')}>
      <div className="px-5 py-7"><Brand /></div>
      <div className="px-4 pb-6"><button onClick={() => setModal('account')} className="flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-sm"><span className="flex min-w-0 items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-foreground"><UserRound className="size-4" /></span><span className="truncate">{user ? user.name : t('个人工作空间', 'Personal workspace')}</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></button></div>
      <div className="px-6 pb-2 text-sm text-muted-foreground">{t('工作台', 'WORKSPACE')}</div>
      <nav aria-label={t('主要导航', 'Main navigation')} className="flex flex-col gap-1 px-3">{navigation.map((item, index) => <div key={item.id}>{index === 5 && <div className="px-3 pb-2 pt-6 text-sm text-muted-foreground">{t('工具与管理', 'TOOLS & MANAGEMENT')}</div>}<Link href={item.href} onClick={() => setMenuOpen(false)} className="nav-item" data-active={section === item.id} aria-current={section === item.id ? 'page' : undefined}><item.icon className="size-[18px]" strokeWidth={1.7} /><span>{t(item.zh, item.en)}</span>{item.id === 'developers' && <span className="ml-auto font-mono text-sm opacity-65">{'</>'}</span>}</Link></div>)}</nav>
      <div className="mt-auto px-4 pb-4 pt-8"><div className="rounded-xl border bg-background p-4"><div className="flex items-center gap-2 text-sm font-medium"><BookOpen className="size-4" />{t('从这里开始', 'Start here')}</div><p className="pb-3 pt-2 text-sm leading-relaxed text-muted-foreground">{t('一份指南，开启你的算力之旅。', 'Your first steps into shared computing.')}</p><button className="flex items-center gap-2 text-sm font-medium" onClick={() => setModal('help')}>{t('阅读入门指南', 'Read the quickstart')}<ArrowUpRight className="size-4" /></button></div></div>
      <div className="border-t px-5 py-4"><button onClick={() => setModal('account')} className="flex w-full items-center gap-3 text-left"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"><UserRound className="size-5" /></span><span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm font-medium">{user ? user.name : t('访客工作区', 'Guest workspace')}</span><span className="truncate text-sm text-muted-foreground">{user ? user.email : t('登录以保存你的工作', 'Sign in to save your work')}</span></span><ChevronRight className="size-4 shrink-0" /></button></div>
    </aside>
    {menuOpen && <button className="fixed inset-0 z-30 bg-foreground/25 xl:hidden" onClick={() => setMenuOpen(false)} aria-label={t('关闭导航', 'Close navigation')} />}
    <div className="xl:pl-64">
      <header className="flex h-[72px] items-center justify-between border-b bg-card px-5 text-card-foreground sm:px-8">
        <div className="flex items-center gap-3"><Button variant="ghost" size="icon" className="xl:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label={t('打开导航', 'Open navigation')}>{menuOpen ? <X /> : <Menu />}</Button><div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex"><span>{t('工作空间', 'Workspace')}</span><ChevronRight className="size-3.5" /><span className="font-medium text-foreground">{t(active.zh, active.en)}</span></div><span className="font-semibold sm:hidden">{t(active.zh, active.en)}</span><Badge variant="secondary" className="hidden md:inline-flex">{t('开发预览', 'Development preview')}</Badge></div>
        <div className="flex items-center gap-2 sm:gap-4"><Button variant="ghost" size="sm" onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')} aria-label={t('切换为英文', 'Switch to Chinese')}><Globe2 data-icon="inline-start" />{locale === 'zh' ? '中文' : 'English'}</Button><span className="h-5 w-px bg-border" /><Button variant="ghost" size="icon" onClick={() => setModal('help')} aria-label={t('帮助中心', 'Help center')}><CircleHelp /></Button><Button variant="ghost" size="icon" onClick={() => setModal('notifications')} aria-label={t('通知', 'Notifications')}><Bell /></Button><button onClick={() => setModal('account')} className="hidden size-8 items-center justify-center rounded-full bg-secondary text-foreground sm:flex" aria-label={t('账户', 'Account')}><UserRound className="size-4" /></button></div>
      </header>
      <main id="main-content" className="mx-auto max-w-[1500px] px-5 pb-28 pt-7 sm:px-8 xl:px-9 xl:pb-8">{sectionPanels[section]}</main>
      <footer className="mx-5 mb-24 flex flex-col justify-between border-t py-5 text-sm text-muted-foreground sm:mx-8 sm:flex-row xl:mb-0"><p>© {new Date().getFullYear()} {t('小黄鲸 Venus · 让算力自由连接', 'Venus · Connecting idle power')}</p><button className="flex items-center gap-2 pt-2 text-left sm:pt-0" onClick={() => { window.location.href = '/settings' }}><span className={cn('size-1.5 rounded-full', status?.database === 'connected' ? 'bg-primary' : 'bg-muted-foreground')} />{dbLabel}<ChevronRight className="size-3" /></button></footer>
    </div>
    <nav aria-label={t('移动端导航', 'Mobile navigation')} className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t bg-card pb-[env(safe-area-inset-bottom)] text-card-foreground xl:hidden">{navigation.slice(0, 5).map(item => <Link key={item.id} href={item.href} aria-current={section === item.id ? 'page' : undefined} className={cn('flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-sm', section === item.id ? 'bg-secondary/60 font-medium text-foreground' : 'text-muted-foreground')}><item.icon className="size-5" />{t(item.zh, item.en)}</Link>)}</nav>
    <WorkspaceDialogs /><Toaster theme="light" position="top-center" />
  </div>
}

export function Workspace({ section = 'overview', locale = 'zh', user = null }: { section?: Section; locale?: Locale; user?: SessionUser | null }) {
  return <WorkspaceProvider initialLocale={locale} user={user}><WorkspaceShell section={section} /></WorkspaceProvider>
}

export function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-4 pb-7"><div><h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1><p className="pt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p></div>{action}</div>
}
