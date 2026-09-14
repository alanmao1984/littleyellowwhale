import Image from 'next/image'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  Boxes,
  Check,
  CircleDollarSign,
  Cpu,
  KeyRound,
  Network,
  ShieldCheck,
  Waypoints,
} from 'lucide-react'
import type { PublicPlatformSummary } from '@/lib/venus/public-summary-core'
import { MarketingLocaleToggle } from './marketing-locale-toggle'

type Locale = 'zh' | 'en'
type CopyPair = readonly [zh: string, en: string]

type Capability = {
  icon: LucideIcon
  title: CopyPair
  body: CopyPair
}

const capabilities: Capability[] = [
  { icon: KeyRound, title: ['Key 金库', 'Key Vault'], body: ['敏感凭据默认遮罩，按策略隔离、轮换与熔断。', 'Sensitive credentials stay masked, isolated, rotated and circuit-broken by policy.'] },
  { icon: Cpu, title: ['小黄鲸矿机', 'Little Yellow Whale Node'], body: ['将闲置 GPU 与模型能力编排为可信算力节点。', 'Orchestrate idle GPUs and model capabilities into trusted compute nodes.'] },
  { icon: Network, title: ['统一 Gateway', 'Unified Gateway'], body: ['OpenAI 兼容接口，自动路由成本、延迟与可用性。', 'An OpenAI-compatible interface routing by cost, latency and availability.'] },
  { icon: Activity, title: ['动态汇率', 'Dynamic Pricing'], body: ['面向模型能力的实时价格发现与微结算。', 'Real-time price discovery and micro-settlement for model capabilities.'] },
  { icon: BookOpenCheck, title: ['双账本', 'Dual Ledger'], body: ['本金、收益与风险保证金独立记账，清晰可审计。', 'Principal, earnings and risk collateral are independently auditable.'] },
  { icon: Boxes, title: ['Skill 市场', 'Skill Market'], body: ['以能力而非模型售卖，组合 Agent、数据与工作流。', 'Trade capabilities—not model names—across agents, data and workflows.'] },
]

const protocolLayers: { number: string; title: CopyPair; body: CopyPair }[] = [
  { number: '01', title: ['应用与交易层', 'Application & Exchange'], body: ['Agent、Skill、模型订单簿', 'Agents, skills and model order books'] },
  { number: '02', title: ['清算与双账本', 'Settlement & Dual Ledger'], body: ['本金 / 收益 / 保证金隔离', 'Principal / earnings / collateral isolation'] },
  { number: '03', title: ['智能 Gateway', 'Intelligent Gateway'], body: ['兼容 OpenAI · 路由 · 计量', 'OpenAI compatible · routing · metering'] },
  { number: '04', title: ['托管与风控层', 'Custody & Risk Control'], body: ['Key Vault · 熔断 · Slashing', 'Key Vault · circuit breakers · slashing'] },
]

const roadmap: { phase: string; title: CopyPair; body: CopyPair; state: CopyPair; active?: boolean }[] = [
  { phase: 'P1', title: ['统一网关', 'Unified Gateway'], body: ['兼容 API、路由、计量与 Key Vault', 'Compatible APIs, routing, metering and Key Vault'], state: ['正在构建', 'In progress'], active: true },
  { phase: 'P2', title: ['双账本清算', 'Dual-ledger Settlement'], body: ['本金、收益、保证金与审计流水', 'Principal, earnings, collateral and audit trails'], state: ['规划中', 'Planned'] },
  { phase: 'P3', title: ['汇率与能力市场', 'Pricing & Capability Market'], body: ['订单簿、动态定价与 Skill 组合', 'Order books, dynamic pricing and skill composition'], state: ['规划中', 'Planned'] },
]

function Brand() {
  return (
    <span className="marketing-brand">
      <span className="marketing-brand-mark" aria-hidden="true">◒</span>
      <span><strong>LITTLE YELLOW WHALE</strong><small>VENUS COMPUTE PROTOCOL</small></span>
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="marketing-kicker">{children}</p>
}

function formatCompact(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function MarketingHome({ locale, summary }: { locale: Locale; summary: PublicPlatformSummary }) {
  const t = ([zh, en]: CopyPair) => locale === 'zh' ? zh : en
  const hasData = summary.state === 'live'
  const metrics = [
    { value: hasData ? formatCompact(summary.todayTokens, locale) : '—', label: t(['今日推理 Token', 'Inference tokens today']) },
    { value: hasData && summary.gatewayAvailability !== null ? `${summary.gatewayAvailability.toFixed(2)}%` : '—', label: t(['24h 网关可用性', '24h gateway availability']) },
    { value: hasData ? summary.activePublicNodes.toLocaleString() : '—', label: t(['活跃公开节点', 'Active public nodes']) },
    { value: hasData ? summary.settledCalls.toLocaleString() : '—', label: t(['累计结算调用', 'Settled calls']) },
  ]

  return (
    <main className="marketing-shell font-sans">
      <header className="marketing-header">
        <Link href="/" aria-label={t(['小黄鲸 Venus 首页', 'Little Yellow Whale Venus home'])}><Brand /></Link>
        <nav className="marketing-nav" aria-label={t(['官网导航', 'Site navigation'])}>
          <a href="#product">{t(['产品', 'Product'])}</a>
          <a href="#protocol">{t(['协议', 'Protocol'])}</a>
          <a href="#security">{t(['安全', 'Security'])}</a>
          <a href="#roadmap">{t(['路线图', 'Roadmap'])}</a>
        </nav>
        <div className="marketing-header-actions">
          <MarketingLocaleToggle locale={locale} />
          <Link href="/app" className="marketing-console-link">{t(['进入控制台', 'Open console'])}<ArrowRight aria-hidden="true" /></Link>
        </div>
      </header>

      <section className="marketing-hero" aria-labelledby="hero-title">
        <Image className="marketing-cover-image" src="/images/venus-hero-whale.jpeg" alt={t(['由金色数据方块构成的小黄鲸', 'A little yellow whale assembled from golden data blocks'])} fill priority sizes="100vw" />
        <div className="marketing-hero-scrim" />
        <div className="marketing-hero-content">
          <div className="marketing-network-status"><span />{t(['VENUS 测试网络在线', 'VENUS TESTNET ONLINE'])}</div>
          <p className="marketing-overline">LITTLE YELLOW WHALE · VENUS</p>
          <h1 id="hero-title">{t(['让每一份闲置算力，', 'Put every idle compute cycle'])}<br />{t(['持续流动。', 'into motion.'])}</h1>
          <p className="marketing-lede">{t(['统一 AI 算力银行：聚合 API、GPU 与智能体能力，通过可信路由、微结算和动态市场，将碎片化供给变成可调用的数字生产力。', 'A unified AI compute bank aggregating APIs, GPUs and agent capabilities—turning fragmented supply into callable digital productivity through trusted routing, micro-settlement and dynamic markets.'])}</p>
          <div className="marketing-hero-actions">
            <Link href="/app" className="marketing-button marketing-button-primary">{t(['进入模拟控制台', 'Enter simulation console'])}<ArrowRight aria-hidden="true" /></Link>
            <a href="#protocol" className="marketing-button marketing-button-ghost">{t(['探索协议架构', 'Explore the protocol'])}</a>
          </div>
          <p className="marketing-disclosure">{t(['演示环境 · 测试账本 · 不涉及真实资产或公开 API Key', 'Demo environment · test ledger · no real assets or public API keys'])}</p>
        </div>
        <dl className="marketing-metrics">
          {metrics.map(metric => <div key={metric.label}><dd>{metric.value}</dd><dt>{metric.label}</dt></div>)}
        </dl>
      </section>

      <section id="product" className="marketing-split marketing-problem">
        <div className="marketing-image-panel">
          <Image src="/images/venus-developer.jpeg" alt={t(['开发者面对 API 额度与限流问题', 'A developer facing API quota and rate-limit constraints'])} fill sizes="(max-width: 768px) 100vw, 55vw" />
        </div>
        <div className="marketing-copy-panel">
          <SectionLabel>01 / THE PROBLEM</SectionLabel>
          <h2>{t(['算力并不稀缺，', 'Compute is not scarce.'])}<br /><em>{t(['流动性才是。', 'Liquidity is.'])}</em></h2>
          <p>{t(['配额散落在不同账户，GPU 在低谷时闲置，Agent 能力无法标准化交易。开发者却仍在承受 429、不可预测账单和供应商锁定。', 'Quotas are scattered across accounts, GPUs sit idle off-peak, and agent capabilities cannot be traded as a standard. Developers still absorb 429s, unpredictable bills and vendor lock-in.'])}</p>
          <ul className="marketing-check-list">
            {([['聚合碎片化 API 与算力供给', 'Aggregate fragmented APIs and compute supply'], ['按质量、价格和延迟智能路由', 'Route intelligently by quality, price and latency'], ['按请求微结算，供需双方实时对账', 'Micro-settle each request for real-time reconciliation']] as const).map(item => <li key={item[0]}><Check aria-hidden="true" />{t(item)}</li>)}
          </ul>
        </div>
      </section>

      <section id="protocol" className="marketing-protocol">
        <div className="marketing-section-heading">
          <SectionLabel>02 / PROTOCOL</SectionLabel>
          <h2>{t(['一座属于 AI 时代的算力交易所', 'A compute exchange for the AI era'])}</h2>
          <p>{t(['Venus 将可信托管、统一网关、双账本与能力市场组装为四层基础设施。', 'Venus assembles trusted custody, a unified gateway, dual ledgers and a capability market into four layers of infrastructure.'])}</p>
        </div>
        <div className="marketing-protocol-grid">
          <div className="marketing-exchange-image">
            <Image src="/images/venus-exchange.jpeg" alt={t(['未来数据交易所', 'A future-facing data exchange'])} fill sizes="(max-width: 768px) 100vw, 62vw" />
          </div>
          <div className="marketing-layer-list">
            {protocolLayers.map(layer => <article key={layer.number}><span>{layer.number}</span><div><h3>{t(layer.title)}</h3><p>{t(layer.body)}</p></div></article>)}
          </div>
        </div>
      </section>

      <section className="marketing-capabilities">
        <div className="marketing-section-heading">
          <SectionLabel>03 / CAPABILITIES</SectionLabel>
          <h2>{t(['从凭据到收益，一套完整的运行轨道', 'One operating rail from credentials to earnings'])}</h2>
          <p>{t(['不是另一个仪表盘，而是让算力供给真正可发现、可调用、可结算的协议层。', 'Not another dashboard, but a protocol layer that makes compute supply discoverable, callable and settleable.'])}</p>
        </div>
        <div className="marketing-capability-grid">
          {capabilities.map(({ icon: Icon, title, body }) => <article key={title[0]}><Icon aria-hidden="true" /><h3>{t(title)}</h3><p>{t(body)}</p></article>)}
        </div>
      </section>

      <section id="security" className="marketing-split marketing-security">
        <div className="marketing-copy-panel">
          <SectionLabel>04 / TRUST INFRASTRUCTURE</SectionLabel>
          <h2>{t(['黑箱之外，', 'Beyond the black box,'])}<br /><em>{t(['每一笔都可解释。', 'every entry is explainable.'])}</em></h2>
          <p>{t(['安全不是页面上的图标。Venus 以最小权限、可审计流水、非托管边界与分层熔断，让供应方和消费方都清楚风险发生在哪里。', 'Security is not an icon on a page. Venus combines least privilege, auditable flows, non-custodial boundaries and layered circuit breakers so both sides know exactly where risk lives.'])}</p>
          <ul className="marketing-check-list marketing-check-list-grid">
            {([['可审计调用与结算流水', 'Auditable calls and settlements'], ['凭据不进入公开账本', 'Credentials never enter public ledgers'], ['本息隔离与风险保证金', 'Principal and collateral isolation'], ['异常路由自动熔断', 'Automatic circuit breaking']] as const).map(item => <li key={item[0]}><ShieldCheck aria-hidden="true" />{t(item)}</li>)}
          </ul>
        </div>
        <div className="marketing-image-panel marketing-vault-panel">
          <Image src="/images/venus-vault.jpeg" alt={t(['Venus 协议金库概念图', 'Venus protocol vault concept'])} fill sizes="(max-width: 768px) 100vw, 45vw" />
          <div className="marketing-health"><strong>{summary.gatewayAvailability === null ? '—' : `${summary.gatewayAvailability.toFixed(2)}%`}</strong><span>{t(['24h 协议可用性', '24h protocol availability'])}</span></div>
        </div>
      </section>

      <section id="roadmap" className="marketing-roadmap">
        <div className="marketing-section-heading">
          <SectionLabel>05 / ROADMAP</SectionLabel>
          <h2>{t(['从流量入口，到算力经济', 'From traffic entry to compute economy'])}</h2>
          <p>{t(['三阶段建立可用、可结算、可定价的开放网络。', 'Three phases toward an open network that is callable, settleable and priceable.'])}</p>
        </div>
        <div className="marketing-roadmap-grid">
          {roadmap.map(item => <article key={item.phase} data-active={item.active || undefined}><span className="marketing-phase">{item.phase}</span><Waypoints aria-hidden="true" /><h3>{t(item.title)}</h3><p>{t(item.body)}</p><small>{t(item.state)}</small></article>)}
        </div>
      </section>

      <section className="marketing-final-cta">
        <CircleDollarSign aria-hidden="true" />
        <h2>{t(['唤醒沉睡的算力。', 'Wake the sleeping compute.'])}</h2>
        <p>{t(['现在进入 Venus 模拟网络，体验从 Key 托管到按请求结算的完整流程。', 'Enter the Venus simulation network and experience the full flow from Key custody to per-request settlement.'])}</p>
        <Link href="/app" className="marketing-button marketing-button-primary">{t(['启动 Venus 控制台', 'Launch Venus console'])}<ArrowRight aria-hidden="true" /></Link>
      </section>

      <footer className="marketing-footer">
        <Link href="/"><Brand /></Link>
        <p>© 2026 LITTLE YELLOW WHALE · VENUS</p>
        <div><a href="#protocol">{t(['协议', 'Protocol'])}</a><Link href="/app/developers">API</Link><a href="#security">{t(['安全', 'Security'])}</a></div>
      </footer>
    </main>
  )
}
