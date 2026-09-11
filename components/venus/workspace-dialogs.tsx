'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, GitBranch, Monitor, Laptop, ShieldCheck, Bell, ArrowUpRight, Check, Smartphone, UserRound, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { authClient } from '@/lib/auth-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { useWorkspace } from './workspace-context'
import { TaskDraftForm } from './task-draft-form'
import { NodeInstallerDownloads, repository, type NodeOperatingSystem } from './connection-panels'

function ConnectionGuide() {
  const { t } = useWorkspace()
  const [os, setOs] = useState<NodeOperatingSystem>('windows')
  const [copied, setCopied] = useState(false)
  const intent = t(`请帮我审查 ${repository} 的可安装版本，并准备在 ${os === 'windows' ? 'Windows' : 'macOS'} 上接入 Venus 节点。先检查版本、许可证、依赖、安装脚本和本机推理服务。任何安装、后台启动、资源共享和设备绑定都必须先征求我的明确同意。不要运行未经验证的下载命令，不要读取或展示长期凭据，也不要修改防火墙或自动下载模型。仓库尚未发布可验证安装版本时，请停止安装并说明缺少的条件。`, `Review installable versions of ${repository} and prepare a Venus node on ${os === 'windows' ? 'Windows' : 'macOS'}. Check the version, license, dependencies, scripts and local inference services first. Ask for my explicit approval before installing, enabling background startup, sharing resources or pairing devices. Do not run unverified downloads, expose credentials, modify the firewall or download models automatically. Stop if no verifiable release exists.`)
  async function copyIntent() {
    try { await navigator.clipboard.writeText(intent); setCopied(true); toast.success(t('已复制接入意图，不是安装命令', 'Setup intent copied. This is not an install command.')) }
    catch { toast.error(t('复制失败，请手动选中文本复制。', 'Copy failed. Select and copy the text manually.')) }
  }
  return <div className="flex flex-col gap-5"><Tabs value={os} onValueChange={value => { setOs(value as NodeOperatingSystem); setCopied(false) }}><TabsList className="w-full"><TabsTrigger value="windows"><Monitor data-icon="inline-start" />Windows</TabsTrigger><TabsTrigger value="macos"><Laptop data-icon="inline-start" />macOS</TabsTrigger></TabsList></Tabs><div className="rounded-xl border bg-background p-4"><div className="flex items-center gap-2"><GitBranch className="size-4" /><span className="font-mono text-sm">alanmao1984/littleyellowwhale</span></div><p className="pt-3 text-sm leading-relaxed text-muted-foreground">{t('正式安装包由公开 GitHub Release 分发，并附带 SHA-256 与签名构建元数据。页面只解析固定仓库和固定文件名。', 'Verified installers are distributed through the public GitHub Release with SHA-256 checksums and signed build metadata. This page resolves only the fixed repository and expected filenames.')}</p></div><NodeInstallerDownloads platform={os} /><ol className="flex flex-col gap-4">{[
    [t('准备本机环境', 'Prepare your environment'), t('保持设备开机联网，准备本地 Ollama 或 vLLM 文本服务。无需开放公网端口。', 'Keep your device online with a local Ollama or vLLM text service. No public port is required.')],
    [t('审查版本并授权安装', 'Review and approve installation'), t('AI 助手需要本机执行权限；先核查固定版本和动作，再由你确认。', 'Your AI assistant needs local execution permission. Review the pinned version and actions before approval.')],
    [t('绑定账户与共享额度', 'Pair and authorize resources'), t('通过“我的节点”生成一次性配对码。绑定后默认不接单，需在资源策略中明确授权模型、并发和接单时段；任务还需单独批准节点与模型。', 'Generate a one-time code in My Nodes. New nodes accept no work until models, concurrency and schedule are authorized in Resource policy. Each task also requires explicit node and model consent.')],
  ].map(([title, detail], index) => <li key={title} className="flex items-start gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-sm">{index + 1}</span><div><h3 className="text-sm font-medium">{title}</h3><p className="pt-1 text-sm leading-relaxed text-muted-foreground">{detail}</p></div></li>)}</ol><details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{t('查看交给 AI 助手的接入意图', 'Review the setup intent for your AI assistant')}</summary><p className="pt-3 text-sm leading-relaxed text-muted-foreground">{intent}</p></details><Button onClick={copyIntent}>{copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}{t('复制安全接入意图', 'Copy safe setup intent')}</Button><p className="text-sm leading-relaxed text-muted-foreground">{t('Windows 与 macOS 安装程序封装同一份前台节点运行时；只连接本机 Ollama / OpenAI 兼容接口。凭据仅保留在进程内，退出后需在网页撤销并重新配对。下载安装仍需系统确认，复制接入意图不会安装或启动软件。', 'The Windows and macOS installers package the same foreground node runtime for local Ollama or OpenAI-compatible services. Credentials remain in process memory; after exit, revoke the node in the web app and pair again. Installation still requires system approval, and copying the setup intent installs or starts nothing.')}</p></div>
}

function AccountPanel() {
  const { t, user } = useWorkspace()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  if (!user)
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p>{t('账户与会话由 Better Auth 加密保护。资金全部为测试账本，不可提现。', 'Accounts and sessions are protected by Better Auth. All balances are a non-withdrawable test ledger.')}</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href="/sign-in" className={cn(buttonVariants({ variant: 'strong' }), 'flex-1')}>{t('登录', 'Sign in')}</a>
          <a href="/sign-up" className={cn(buttonVariants({ variant: 'outline' }), 'flex-1')}>{t('免费注册', 'Create account')}</a>
        </div>
      </div>
    )
  async function handleSignOut() {
    setPending(true)
    try {
      await authClient.signOut()
      router.push('/')
      router.refresh()
    } catch {
      toast.error(t('退出失败，请稍后再试。', 'Sign-out failed. Please try again.'))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border bg-background p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-foreground"><UserRound className="size-5" /></span>
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>{t('会话已建立。资金全部为测试账本，不可提现；真实任务需节点接入并确认报价后执行。', 'Your session is active. All balances are a non-withdrawable test ledger, and real tasks run only after a node is connected and a quote approved.')}</p>
      </div>
      <Button variant="outline" onClick={handleSignOut} disabled={pending}>
        <LogOut data-icon="inline-start" />{pending ? t('退出中…', 'Signing out…') : t('退出登录', 'Sign out')}
      </Button>
    </div>
  )
}

export function WorkspaceDialogs() {
  const { modal, setModal, t, user } = useWorkspace()
  const titles = {
    task: [t('创建任务', 'Create a task'), t('选择文本、视频或图片任务，先准备草稿，再确认数据与执行计划。', 'Choose text, video, or image work, then review data and execution.')],
    connect: [t('接入你的第一份算力', 'Connect your first compute node'), t('从本机出发，安全地加入协作网络。', 'Start locally. Join the network safely.')],
    account: user
      ? [t('你的工作空间', 'Your workspace'), t('账户已登录，会话由 Better Auth 保护。', 'You are signed in. Your session is protected by Better Auth.')]
      : [t('建立你的工作空间', 'Set up your workspace'), t('使用邮箱和密码登录或注册，即可保存你的工作。', 'Sign in or register with email and password to save your work.')],
    help: [t('欢迎登上小黄鲸', 'Welcome aboard Venus'), t('关于任务、算力与收益，你需要知道这些。', 'What to know about tasks, compute and earnings.')],
    notifications: [t('通知中心', 'Notifications'), t('任务与节点的重要更新将在这里出现。', 'Important task and node updates will appear here.')],
    install: [t('把小黄鲸放到主屏幕', 'Add Venus to your home screen'), t('这是 Web 应用，不是运行 GPU 的节点程序。', 'This is a web app, not a GPU node runtime.')],
  }
  const content = modal ? titles[modal] : ['', '']
  return <Dialog open={!!modal} onOpenChange={open => { if (!open) setModal(null) }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{content[0]}</DialogTitle><DialogDescription>{content[1]}</DialogDescription></DialogHeader>
    {modal === 'task' && <TaskDraftForm />}
    {modal === 'connect' && <ConnectionGuide />}
    {modal === 'account' && <AccountPanel />}
    {modal === 'notifications' && <Empty><EmptyHeader><EmptyMedia variant="icon"><Bell /></EmptyMedia><EmptyTitle>{t('这里暂时很安静', 'All quiet for now')}</EmptyTitle><EmptyDescription>{t('尚未登录，没有可读取的个人通知。任务完成或节点状态变化后，通知服务将提供更新。', 'You are not signed in, so no personal notifications are available. A future notification service will report task and node updates.')}</EmptyDescription></EmptyHeader></Empty>}
    {modal === 'help' && <div className="flex flex-col gap-5">{[
      [t('我能在这里做什么？', 'What can I do here?'), t('准备批量文本任务、了解算力接入与透明测试分账。当前可以编辑、拆分和下载草稿，真实执行需要账户与节点服务到位。', 'Prepare batch text tasks and explore compute setup and transparent test accounting. Editing, splitting and exporting drafts are available. Real execution requires accounts and nodes.')],
      [t('我的文本会发送给谁？', 'Who receives my text?'), t('草稿预览不上传文本。未来提交真实任务时，文本会发送到你明确批准的提供方；模型密钥保留在设备本地。', 'Draft preview does not upload text. Real submissions will send text to your approved provider. Model credentials stay local.')],
      [t('收益可以提现吗？', 'Can I withdraw earnings?'), t('不可以。当前设计为隔离的测试账本，T+7 解冻后仍是不可提现的测试资金。', 'No. This is an isolated test ledger. Even after T+7 release, funds remain non-withdrawable test funds.')],
      [t('关闭网页后，节点还在运行吗？', 'Does closing the web page stop a node?'), t('网页只是控制入口。节点程序必须单独安装，并在可见的前台终端中保持运行；关闭节点终端会停止接单。', 'The web page is only a control surface. Install the node separately and keep it running in a visible foreground terminal. Closing that terminal stops new work.')],
    ].map(([title, text]) => <section key={title}><h3 className="text-sm font-semibold">{title}</h3><p className="pt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></section>)}<Button variant="outline" onClick={() => setModal('task')}>{t('试试任务草稿', 'Try a task draft')}</Button></div>}
    {modal === 'install' && <div className="flex flex-col gap-5"><div className="rounded-lg border bg-background p-5"><h3 className="flex items-center gap-2 font-medium"><Smartphone className="size-5" />iPhone / iPad</h3><p className="pt-2 text-sm leading-relaxed text-muted-foreground">{t('在 Safari 中打开已部署的网站，点击“分享”，选择“添加到主屏幕”。内嵌预览中无法安装。', 'Open the deployed site in Safari, tap Share, then Add to Home Screen. Installation is unavailable inside the embedded preview.')}</p></div><div className="rounded-lg border bg-background p-5"><h3 className="flex items-center gap-2 font-medium"><Monitor className="size-5" />Chrome / Edge</h3><p className="pt-2 text-sm leading-relaxed text-muted-foreground">{t('在独立浏览器标签页打开已部署的 HTTPS 网站，使用地址栏的安装图标或浏览器菜单中的“安装应用”。', 'Open the deployed HTTPS site in a standalone tab. Use the address bar installation icon or Install App in the browser menu.')}</p></div><p className="text-sm leading-relaxed text-muted-foreground">{t('离线时只提供说明页面，不缓存账户、任务文本、结果、凭据或账本，也不会离线重放提交。', 'Offline mode only shows a help page. Accounts, task text, results, credentials and ledgers are not cached, and submissions are never replayed offline.')}</p></div>}
  </DialogContent></Dialog>
}
