# 小黄鲸 Venus v2.1 开发与验收基线

## 1. 定位与本轮边界

本文件把 v2.0 的产品愿景收敛到当前仓库可定位、可测试的工程实现。依据为已批准的 `v0_plans/pure-sketch.md`、实际代码、Neon 实时结构与本轮测试；不是对所有战略能力的上线声明。原始只读材料不被覆盖。

当前目标：**同一账户拥有任务和节点的本地执行闭环**。

登录 → 一次性配对 → 本机前台授权与平台资源策略取交集 → 提交记录并预留 VTEST → 领取、续租、执行、回传 → 逐条核验 → 整单结算或退款 → T+7 测试收益解冻。

不在本轮：真实充值、提现、黄金兑换、跨用户撮合、自动换节点、商业公网推理网关、Go/Rust/Tauri 重写、远程桌面、跨设备模型并行、DNA 商城、工业设备控制、企业多租户。页面里的接入介绍、算力池空状态、兑换说明不是这些能力的实现证据。

### 术语

- **VTEST**：不可购买、提现、转账或兑换的测试计价单位，不是存款、货币、投资产品或收益承诺。
- **执行状态**：任务是否待领取、执行中、回传待核验、未派发取消。
- **核验决定**：所有者对单条结果的接受或拒收；不是第三方质量鉴定。
- **最终处置**：所有记录终止且核验完成后，整单一次性移动预算并记录分配快照。
- **不确定**：请求超时、续租失败、进程/服务停止无法确认等。不得据此自动重跑或自动退款。
- **调度租约**：数据库中领取启动 Workflow 的短期资格，不等于节点执行租约。

## 2. 能力清单与证据

| 能力 | 当前状态 | 代码与验证 |
| --- | --- | --- |
| 密码登录、邮箱 OTP、会话 | 已实现；真实浏览器新登录受域名配置阻塞 | `lib/auth.ts`、`tests/auth.integration.mts`；真实 Better Auth + 隔离数据库，验证码供应商验证使用测试桩 |
| 已配置 Google/GitHub OAuth | 保留；无配置时不显示按钮 | `lib/auth.ts`、`components/venus/auth-form.tsx`；本轮没有真实 OAuth 授权回调验收 |
| Turnstile 失败关闭 | 本轮修复并测试 | `lib/venus/auth-config.ts`、`components/venus/turnstile-widget.tsx` |
| OTP 防泄漏与发送失败处理 | 本轮修复并测试 | `lib/venus/email.ts`；没有发真实验证码邮件做交付验证 |
| 持久化认证限流 | 本轮修复并通过真实数据库测试 | Better Auth 1.7.3 数据库限流、`rate_limit` 唯一 key |
| 单次配对、令牌哈希、撤销、资源策略 | 既有实现并回归 | `lib/venus/nodes.ts`、`tests/execution.integration.mts` |
| 预算预留、领取幂等、并发限制、fence | 既有实现并回归 | `ledger.ts`、`execution.ts`、协议集成测试 |
| 逐条接受/拒收、部分取消后结算 | 本轮实现并通过数据库竞争测试 | `settlements.ts`、`tests/settlements.integration.mts` |
| T+7 测试解冻 | 本轮实现；数据库到期与幂等已测试 | `workflows/settlement-release.ts`；未用真实时间等待七天，未在部署环境验收 Workflow 持久恢复 |
| 启动调度租约与请求补偿 | 本轮实现并测试数据库领取竞争 | `dispatch.ts`、`lease-watchers.ts`、`settlement-watchers.ts` |
| 前台 CLI 文本推理 | 既有适配器，增加同键领取重试 | `packages/venus-node/src/runtime.ts`；未连接真实 Ollama/vLLM 实机 |
| FFmpeg 受限视频处理 | 本轮加固，路径/取消逻辑已测 | `adapters.ts`、`media-security.ts`；本环境未安装 FFmpeg，未验收成品 |
| ComfyUI 批准模板 | 本轮加固，模板/下载边界已测 | 同上；没有真实 ComfyUI 实机验收，测试响应不代表真实图像生成 |
| 媒体分发 | 仅本机输出与结果 JSON | 不提供云媒体存储、下载链接或远程文件浏览 |
| MCP 能力读取与文本草稿 | 已实现，继续限制为 read_draft | `app/api/mcp/route.ts`；不能执行、核验或移动余额 |

## 3. 真实架构与信任边界

- Web：Next.js **16.3.3** App Router、React 19、TypeScript、Tailwind、shadcn/Base UI、SWR。
- 数据：Neon PostgreSQL，共享 `pg.Pool` 与 Drizzle；Better Auth 直接使用同一 Pool。不添加第二数据库驱动或新的数据库供应商。
- 调度：Workflow **4.8.8**，Next.js `withWorkflow`。Workflow 只编排，数据库事务决定是否允许记账。
- 设备：Node.js **24+** TypeScript 前台 CLI，不是后台 agent 服务，不安装系统守护进程。
- 本机后端：Ollama、OpenAI-compatible 本机服务、FFmpeg、专用 ComfyUI。

### 数据流

1. 浏览器草稿暂存在 React 内存；不写 localStorage。提交后指令、输入文本、路径、媒体参数和工作流模板存入平台数据库。
2. CLI 出站 HTTPS 领取属于该所有者且固定到该节点的任务。本机 HTTP 后端只允许 `127.0.0.1` 或 `[::1]`，拒绝凭据、查询参数、fragment 与重定向。
3. 文本结果、计量、错误、路径和媒体元数据回传平台并持久化。媒体二进制留在本机。
4. 邮箱地址和验证码发给 Resend；人机验证 token 发给 Cloudflare。应用日志不输出验证码、节点令牌或账户密码。

**本地保管密钥不等于数据不出域。** 当前没有任务/结果端到端加密，不得宣传平台不可读取内容。本机路径与模板可能包含敏感名称，也需要用户授权；不要在模板中放秘密。

### 权限矩阵

| 主体 | 可做 | 不可做 |
| --- | --- | --- |
| 未登录浏览器 | 查看公开页面，内存准备草稿 | 读取个人账目、创建任务、核验、配对 |
| 登录账户 | 操作自己的任务、节点和测试账本 | 操作他人的记录或任意指定收款人 |
| `vn_` 节点令牌 | 自身心跳、领取、续租、结果回传 | 核验、退款、结算、操作其他节点 |
| `vsk_` read_draft 令牌 | 读取自有能力/账本、准备文本草稿 | 提交执行、预留预算、分账、解冻 |
| Workflow | 根据固定 userId 与业务 ID 检查数据库状态 | 接收客户端指定金额、绕过到期条件 |

Neon 应用表没有 RLS。所有已确定主体的业务查询使用 `userId` 条件；配对码/令牌哈希查询是解析身份的入口，不是任意用户 ID 查询入口。

## 4. 认证与配置

### 认证规则

- 保留密码、邮箱 OTP 与已有 OAuth 配置机制，不添加其他登录方式。
- 密码/OTP 敏感路由始终经过 captcha 插件。生产缺少任一有效配置或使用官方测试 key 时失败关闭；会话读取、退出不受验证码配置错误影响。
- 开发环境仅在 site key 与 secret **都未配置**时成对使用 Cloudflare 官方测试配置；仍渲染真实 widget、读取 callback token。测试 secret 绝不能当作前端 token。
- 已配置真实 key 时开发环境也用该真实配对；只配置一半不降级到测试配置。生产禁止测试配置。
- 每次提交后移除旧 widget、清空 token 并创建新验证。OTP 发送与 OTP 登录分别消耗不同 token。
- 单例脚本加载、超时、卸载移除 widget、错误提示与手动重试均在 `turnstile-widget.tsx`。
- `SameSite=None; Secure` 保留在 development 配置中，精确可信源与 CSRF 检查保留。生产不信任共享域名通配符。
- Better Auth 内置密码散列和数据库会话保持不变。会话默认七天，有效会话仍要在每个受保护读取/写入处由服务端验证。

### 限流

`rateLimit.storage='database'`，`modelName='rate_limit'`。默认每 60 秒 60 次；密码登录 5 次、注册 3 次、OTP 登录 5 次、OTP 端点 3 次。数据库唯一 key 加当前版本的条件增量更新处理并发，不依赖 Serverless 单实例内存。

部署必须验证可信 IP 转发链。缺失可信 IP 时 Better Auth 会使用共享每路径桶，可能限制多个用户；不要盲目信任客户端可伪造的转发头。公网节点/API 的 WAF、设备注册配额与全面防滥用限流仍未完成。

### 邮件

`sendOtpEmail` 缺 key/domain/签名 secret、超时或非成功 HTTP 状态都抛通用失败，不伪报发送成功。10 秒超时；幂等键由服务端 HMAC 绑定规范化邮箱、用途和 OTP，不在 header 或日志中包含明文 OTP。相同发送事件可去重，不同用途不共用键。Resend 请求结果只表示供应商接受，不代表最终邮件投递成功；没有新增 delivery webhook。

### 配置矩阵

| 变量 | 使用位置与要求 |
| --- | --- |
| `DATABASE_URL` | 共享 pg Pool，运行和生产构建时需要加载；连接信息绝不写进文档 |
| `BETTER_AUTH_SECRET` | 已有项目 secret；签名会话与邮件幂等 HMAC，不在客户端可见 |
| `BETTER_AUTH_URL` | 可选稳定认证地址；否则按既有生产域名、部署域名、v0 runtime 顺序解析 |
| `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` | 平台注入；精确生产源 |
| `V0_RUNTIME_URL` / `V0_DEV_APP_URL` / `V0_BUILD_URL` / `V0_SANDBOX_URL` | 平台注入；仅 development 添加对应精确可信源 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 前端公开 key，必须与 secret 成对，并授权实际访问域名 |
| `TURNSTILE_SECRET_KEY` | 仅服务端验证；生产禁止官方测试值 |
| `RESEND_API_KEY` / `RESEND_EMAIL_DOMAIN` | 已有邮件服务；发件地址为 `auth@该域名`，域名必须已验证 |
| `GOOGLE_CLIENT_ID/SECRET`、`GITHUB_CLIENT_ID/SECRET` | 仅配置成对时启用原有 OAuth；本轮不要求增加或补填 |

项目还存在 Neon Auth/Supabase 相关变量，不代表本应用采用这些认证系统。当前会话仍由 Better Auth 管理；不要混用认证客户端。

### 本轮浏览器阻塞

真实 key 在当前预览域名返回 **Turnstile 110200：Domain not authorized**。页面已显示具体原因，并同时禁用密码登录、发送 OTP 和 OTP 登录；没有改为绕过验证。站点管理员需要在现有 Turnstile 的 **Hostname Management** 允许实际访问域名，或在已授权域名验收。无须重复提交现有 secret。

## 5. 执行、取消与核验状态机

### 执行状态

- task：`pending_nodes`（仅预留未授权）→ `queued` → `running` → `review`。
- `cancelling`：已禁止新派发，仍有执行中记录。
- task_item：`pending` → `running` → `review`；未派发项可变为 `cancelled`。
- 失败/过期仍为 `review`，通过 `errorCode` 区别。原始结果、计量、attempt、fence 保留。
- task.settlementStatus：`unverified` → `settled`；与上述执行状态独立。列表对已处置任务显示“整单已处置”。
- reviewDecision：空 → `accepted` / `rejected`；未派发取消写 `cancelled`。同一决定重试成功，冲突决定拒绝，确认后不允许改写。

### 领取与恢复

- 领取请求带 UUID `requestId`，`claimKey=nodeId:requestId` 唯一；响应不确定时 CLI 有限重试同一个请求键。
- 节点模型名、显式任务能力、本机前台授权、平台策略、接单时段、固定节点、用户同意与并发限制必须同时满足。
- 节点行锁串行分配槽位；任务级并发和节点级并发都检查。
- 执行租约 90 秒，CLI 约每 15 秒续租；单次 attempt 最长 30 分钟。文本调用最长 8 分钟，FFmpeg 最长 20 分钟，ComfyUI 30–1800 秒范围内取任务限制。
- result 带 attemptId/fence/model。旧 fence、过期结果、冲突回传被拒绝；相同结果 envelope 只重发，不重新调用本机后端。
- 运行中取消只请求中止。网络超时或后端停止不确定不代表副作用已撤销。

### 取消与最终处置

1. 取消在同一事务将未领取项设为 cancelled，释放该部分预留一次；在途及待核验部分保留预算。
2. 成功且有非空输出、没有执行错误的记录才可接受。
3. 错误/不确定记录只能继续待核验，或由该任务所有者明确拒收。这里是自有节点测试，不是公网买家单方面拒付规则。
4. 仍有 pending/running 项时禁止最终处置；先结束执行或取消未派发部分。
5. 逐条决定完毕后点“按核验决定完成整单处置”；全部成功也可“全部接受并结算”，但仍有二次确认。
6. 最终事务把接受部分分账、拒收部分退回，剩余 `reservedAmount` 归零。已取消部分不会再次退款。
7. 已结算任务不能被取消重新改写；重复结算返回原分账快照，不返回伪造的全零金额。

### 错误约定

- HTTP 层：缺主体 401、结构不合法 400；节点业务错误见具体 `/api/node/*` 路由返回。
- 领取可能正常返回 assignment=null：`heartbeat_required`、`concurrency_limit`、`no_matching_task`、`claim_no_longer_valid` 等不是成功执行。
- 执行：`not_found`、`lease_mismatch`、`lease_lost`、`result_conflict`、`usage_limit`。
- 人工处置：`invalid_input`、`not_found`、`not_ready`、`output_required`、`review_required`、`decision_conflict`、`reconciliation_required`。
- 历史缺少完整分账证据：`legacy_reconciliation_required`；不自动猜测金额。

## 6. 测试资金与对账

### 金额规则

金额落库为 `numeric(18,4)`，API 使用十进制字符串，内部 BigInt 万分单位运算。客户端不能提交价格、分账份额或解冻时间。单价当前固定 `0.0200 VTEST`；首次访问账户测试钱包原子创建 `100.0000 VTEST` 额度与唯一 grant 分录。

计费单位：文本每条 1；视频切段按每 10 秒向上取整；转码每条 1（测试占位计费，不是实际计算成本）；图像按 512×512 像素面积单位向上取整。尺寸/时长来自验证后的参数，不证明实际计算量。

令原预算、已接受、最终累计退款分别为 B、A、R：

$$B=A+R$$

供给方份额 P、未分配经纪份额 K 与平台份额 F：

$$P=\lfloor 0.85A\rfloor_{4},\qquad K=\lfloor0.05A\rfloor_{4},\qquad F=A-P-K$$

平台接收舍入余数，保证守恒；本轮固定单价与单位组合通常恰好形成 85/5/10。经纪只记 `broker_unallocated`，不向任何人付款。

钱包四余额：`spendingAvailable`、`spendingReserved`、`earningEscrowed`、`earningAvailable`。最终处置预留归零；原预算与退款总额保存在不可变 `task_settlement` 明细中。`refundedAmount` 包括前面取消已退的部分，本次实际新增退款不包含那一部分。

### T+7

T 精确定义为 **整单最终核验事务的 settledAt**。`releaseAt` 为该时刻加七个 24 小时，使用 UTC 时间点，不是当地第七个自然日。只把该结算的 providerAmount 从 earningEscrowed 转入 earningAvailable；不生成新增资产。

零供给方金额的全退款结算直接标记 released（无须等待）。Workflow 唤醒不构成记账授权；数据库在行锁下重查状态、所有者和到期时间，写入一对唯一 `unfreeze-out/in` 分录。提前、重复、跨用户调用不能产生转账。

### 分录和锁顺序

- 钱包首次创建与 grant 同一事务；遇到已存在钱包不补造历史 grant。
- 创建任务：节点锁（有执行授权时）→ 钱包锁 → 新任务和记录。
- 领取/续租/回传：节点锁 → 任务锁 → 记录锁。
- 取消/核验/结算：任务锁 → 记录锁 → 钱包锁；核验不移动资金。
- 解冻：结算锁 → 钱包锁，不反向请求任务/节点锁。
- 业务唯一键：grant:userId、reserve-out/in:taskId、cancel-pending-out/in:taskId、settle-out/provider/broker/platform/refund:taskId、unfreeze-out/in:settlementId。
- `broker_unallocated` 与 `platform_revenue` 的 balanceAfter 是单任务测试分配额，不是平台跨用户总账余额。

`reconcileWallet(userId)` 在只读 repeatable-read 事务中检查：四余额非负且等于对应分录合计、未处置任务预留合计等于钱包预留、每份结算预算与分配守恒。出现差异只报告问题，不自动修复历史余额。需要人工核对缺失分录、旧数据及会话误用后，另行批准修复。

MCP 使用 `readWallet`，没有钱包时返回 initialized=false；不创建 grant、不做解冻。账户页面/API 使用 `getWallet`，可执行已经获得最终核验授权的到期补偿。

## 7. 当前数据模型与增量迁移

真实表名：`user`、`session`、`account`、`verification`、`node`、`node_identity`、`node_heartbeat`、`enrollment_intent`、`api_token`、`task`、`task_item`、`wallet`、`ledger_entry`，以及本轮新增 `task_settlement`、`rate_limit`。不把旧设计里的 `lyw_*` 当作已部署表。

既有业务时间列多数是 timestamp without time zone，沿用现有 UTC 应用语义，不批量转换历史时间。新增核验/调度/结算时间列为 timestamptz。项目保留 Better Auth 原生 camelCase 列名，引用 SQL 时必须双引号。

### 已执行的变更

在用户明确批准后创建隔离 Neon 分支 `venus-v2-1-safety-tests`（`br-quiet-term-au6a708a`），父分支为 `br-steep-cell-aulya300`。先验证新增结构，再将相同 DDL 应用到父分支；业务竞争测试在隔离分支运行。没有历史结算回填，没有调整父分支历史余额。

- task_item：新增 reviewDecision、reviewedBy、reviewedAt、reviewReason、watcherClaimId、watcherClaimUntil，均允许空，避免杜撰历史审计。
- node_heartbeat：新增 capabilities JSONB，非空默认 `["text:infer"]`。
- task_settlement：每任务唯一、金额快照、releaseAt/releasedAt、releaseRunId 与调度租约；金额非负、预算守恒、分配守恒、VTEST 和状态 check 约束。
- rate_limit：id 主键、key 唯一、count integer、lastRequest bigint 毫秒时间戳。
- 索引：task_item_dispatch_idx(userId,status,watcherClaimUntil)、task_settlement_due_idx(userId,status,releaseAt)、rate_limit_expiry_idx(lastRequest)。保留既有 attemptId、claimKey、requestKey、businessKey 唯一索引与 item_lease_idx。

### DDL 重放规范

仅通过 Neon MCP 执行，每次一条 SQL；先确认实时 schema，不使用 Drizzle Kit 推库。以下是本轮完整增量结构，重放前仍需检查目标分支并获批：

```sql
ALTER TABLE task_item
  ADD COLUMN IF NOT EXISTS "reviewDecision" text,
  ADD COLUMN IF NOT EXISTS "reviewedBy" text,
  ADD COLUMN IF NOT EXISTS "reviewedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "reviewReason" text,
  ADD COLUMN IF NOT EXISTS "watcherClaimId" text,
  ADD COLUMN IF NOT EXISTS "watcherClaimUntil" timestamptz;

ALTER TABLE node_heartbeat ADD COLUMN IF NOT EXISTS capabilities jsonb
  NOT NULL DEFAULT '["text:infer"]'::jsonb;

CREATE TABLE IF NOT EXISTS task_settlement (
  id text PRIMARY KEY, "taskId" text NOT NULL UNIQUE, "userId" text NOT NULL,
  currency text NOT NULL DEFAULT 'VTEST',
  "originalAmount" numeric(18,4) NOT NULL, "acceptedAmount" numeric(18,4) NOT NULL,
  "refundedAmount" numeric(18,4) NOT NULL, "providerAmount" numeric(18,4) NOT NULL,
  "brokerAmount" numeric(18,4) NOT NULL, "platformAmount" numeric(18,4) NOT NULL,
  status text NOT NULL DEFAULT 'escrowed', "settledAt" timestamptz NOT NULL DEFAULT now(),
  "releaseAt" timestamptz NOT NULL, "releasedAt" timestamptz,
  "releaseRunId" text, "releaseClaimId" text, "releaseClaimUntil" timestamptz,
  CHECK (currency = 'VTEST'), CHECK (status IN ('escrowed','released')),
  CHECK ("acceptedAmount" >= 0 AND "refundedAmount" >= 0 AND "providerAmount" >= 0 AND "brokerAmount" >= 0 AND "platformAmount" >= 0),
  CHECK ("originalAmount" = "acceptedAmount" + "refundedAmount"),
  CHECK ("acceptedAmount" = "providerAmount" + "brokerAmount" + "platformAmount")
);

CREATE TABLE IF NOT EXISTS rate_limit (
  id text PRIMARY KEY, key text NOT NULL UNIQUE, count integer NOT NULL, "lastRequest" bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS task_settlement_due_idx ON task_settlement ("userId",status,"releaseAt");
CREATE INDEX IF NOT EXISTS task_item_dispatch_idx ON task_item ("userId",status,"watcherClaimUntil");
CREATE INDEX IF NOT EXISTS rate_limit_expiry_idx ON rate_limit ("lastRequest");
```

历史 settled 任务没有自动补齐解冻时间。重复确认可以读取完整的旧分账分录；没有完整证据时停止处理。历史钱包存在而 grant 分录缺失也不静默补造，交由对账流程处置。

## 8. 本机执行最小安全边界

### 本地授权与能力版本

协议沿用心跳 `protocolVersion: 1`，增加可选 capabilities，旧客户端按文本处理。平台资源策略新增 allowedCapabilities，旧策略默认文本。当前值仅为 `text:infer`、`video:segment`、`video:transcode`、`image:multi_shot`。

CLI 每次启动重新授权，令牌/策略仅在当前前台进程内。媒体默认关闭，必须输入 media，再指定现有输入与输出根目录及操作；ComfyUI 还需要本地模板文件和完整 SHA-256 确认。关闭进程后下次重新配对，不保存长期节点令牌。

网页策略与 CLI 授权取交集，任务本身不能新增权限。能力是节点自报而非硬件远程证明；有模型名不代表能运行 FFmpeg/ComfyUI，能报告服务状态也不证明结果质量。

### 路径和文件

- 规范化用户批准根目录；拒绝根目录外路径、符号链接子路径、跨盘子路径、输入输出同路径、已有输出覆盖。
- 请求的输出父目录必须存在且在授权根内；每次执行建立独立 `venus-attemptId-随机后缀` 目录。
- 视频输入仅独立 MP4/MOV/WebM，扩展名加文件头检查，固定解复用器与 file 协议，禁用 MOV 外部数据引用与绝对引用。
- FFmpeg 以 shell=false 固定参数运行，`-n` 不覆盖、`-nostdin`；忽略远端可执行文件建议，只使用本次本地批准的 executable。
- 固定组合：MP4/MOV 为 libx264+aac；WebM 为 libvpx-vp9+opus。其他 codec 请求明确拒绝，不假装采用请求编码器。
- 子进程已 abort 不启动；执行中先 SIGTERM，再在两秒后尝试 SIGKILL，等待 close 后处理临时目录。跨 Windows/macOS 行为仍需实机回归。
- 视频上限 50,000,000 字节，达到上限不标成功。ComfyUI 最多四文件、合计 50,000,000 字节；逐块读取、扣减总额度、`wx` 独占写入，超限取消读取并清理。

这些是应用级防护，**不是 OS 强沙箱**。同机其他进程仍可能制造检查后替换路径的竞态；已有设备权限、文件系统访问控制、自定义模型服务权限不受本代码隔离。未来对不可信第三方任务必须使用操作系统沙箱、配额、独立用户与更严格的文件描述符传递。

### ComfyUI 批准模板格式

本地文件包含 workflow（API 格式原始节点图）、allowedClasses（本机批准类名）与 inputs（prompt/可选 negativePrompt/seed/width/height 的精确 node+key 映射）。下例仅展示结构，不是可直接运行的模型工作流：

```json
{
  "workflow": {
    "1": {"class_type":"ExampleApprovedNode","inputs":{"text":"","seed":1,"width":512,"height":512}}
  },
  "allowedClasses":["ExampleApprovedNode"],
  "inputs": {
    "prompt":{"node":"1","key":"text"},
    "seed":{"node":"1","key":"seed"},
    "width":{"node":"1","key":"width"},
    "height":{"node":"1","key":"height"}
  }
}
```

远端 mediaSpec.comfyWorkflow 必须与本地 workflow 的规范化哈希相同。模板类与每个映射必须通过本机检查，不能把提示词映射到加载文件路径等危险参数。远端不能增加节点、任意改变参数或以工作流替换本地许可。

批准模板只意味着设备所有者同意，不意味着审计机构认证。尤其 SaveImage 路径、自定义节点、模型加载器和网络访问权限必须由所有者审查。ComfyUI 实例自身写入的文件可能不在 CLI 下载目录，必须采用专用实例和独立权限。代码不对共享实例调用全局 interrupt；超时/取消后后端仍可能继续运行，结果保持不确定。

## 9. 实际接口与源码入口

| 接口/入口 | 主体 | 作用 |
| --- | --- | --- |
| `/api/auth/[...all]` | Better Auth | 原生认证、会话、OTP、已配置 OAuth |
| Server Action `submitTask` | 登录用户 | 校验、按服务端单价预留、写入任务 |
| `cancelTask` / `reviewTaskItem` / `settleTask` | 登录任务所有者 | 取消、逐条核验、整单最终处置 |
| `/api/node/enroll` POST | 一次性配对码 | 单次消费意图并颁发节点令牌 |
| `/api/node/heartbeat` POST | `vn_` | 上报模型/能力，返回当前策略，触发恢复 |
| `/api/node/claim` POST | `vn_` | 同键领取租约，启动 watcher 恢复 |
| `/api/node/renew` POST | `vn_` | 校验 fence、当前状态，续租或请求中止 |
| `/api/node/result` POST | `vn_` | 写回结果证据，不直接分账 |
| `/api/v1/tasks` GET | 登录用户 | 自有任务，租约恢复入口 |
| `/api/v1/tasks/[taskId]/results` GET | 登录任务所有者 | 输出、错误、审计、结算与到期快照；download=1 导出 JSON |
| `/api/v1/wallet`、`/api/v1/ledger` GET | 登录用户 | 四余额与个人分录；wallet 补偿到期解冻 |
| `/api/v1/nodes`、`/api/v1/tokens` GET | 登录用户 | 自有节点与令牌管理视图 |
| `/api/mcp` POST | `vsk_` read_draft | JSON-RPC 初始化、tools/list、三个只读/草稿工具 |

MCP 三工具：venus_discover_capabilities、venus_prepare_task_draft、venus_get_test_billing。后者不触发资金维护。节点请求流式限制 body 大小；MCP 本轮也采用 150,000 字节有界读取。令牌的最近使用时间是审计元数据，不是资金操作。

**不存在的接口**：公网 `/v1/chat/completions`、商业 OpenAI-compatible Gateway、跨节点自动路由、支付/提现/黄金兑付、DNA 交易接口。本机 OpenAI-compatible adapter 不等于平台已经提供公网商业网关。

## 10. 工作流调度与运维

启动前通过数据库条件更新领取 60 秒调度租约，保存随机 claimId。只有仍持有该 claim 的调用可以写回 runId；失效领取者不能覆盖后来者。启动失败释放 claim；进程中断后等租约到期由下次请求恢复。

**保证级别是至少一次启动、幂等业务效果，不是跨 Neon 与 Workflow 的 exactly-once。** 启动成功但 runId 写回失败可能产生重复 Workflow，解冻与租约检查仍以数据库为准。

补偿入口：节点心跳/领取、任务列表、钱包读取、最终结算操作。先核实过期执行租约或到期结算，再尝试启动缺失的工作流。单次恢复批量有限；持续积压会在后续请求继续处理。

若 Workflow 启动失败且再无用户/节点请求，本轮没有独立 Cron 保证恢复；不要宣传无人值守可用性。已经成功启动的持久工作流由 Workflow 基础设施唤醒；生产可达性和灾难恢复须单独验收。

### 监控建议与运行手册

1. 认证失败：先区分 110200 域名未授权、无 token、token 失效、Origin 校验、429、邮件供应商失败。不要通过关闭 CSRF/captcha 排除问题。
2. 任务卡住：核实节点最后心跳、enrolled/paused/revoked、模型/能力交集、时间窗、并发、attempt/fence/leaseExpiresAt。停止新派发后检查本地服务，不重新执行不确定任务。
3. 待解冻积压：查看 status=escrowed、releaseAt、releaseRunId/claimUntil；安全地通过现有用户入口恢复。错误金额先运行对账，不直接 update 钱包。
4. 日志仅包含错误类型或业务 ID。严禁记录 OTP、密码、令牌、完整邮箱/任务正文；需要临时诊断后移除。
5. 建议监控 lease_expired 数、调度重试数、到期未解冻数、对账差异、认证 429 比例。当前没有新增监控供应商或独立告警服务。
6. 数据默认持续保存；未提供自动任务清理、完整账户擦除流程或法律保留策略。对外使用前需要明确保留周期、导出与删除权限。

## 11. 开发、部署、升级与回滚

推荐通过 GitHub 或 shadcn CLI 获取项目。开发者环境使用现有 pnpm lockfile 和 Node.js 24+；保持 root 与 `packages/venus-node` 的共享依赖一致。本轮不更换框架、依赖版本或安装新供应商。

开发者校验命令（不要求 v0 预览用户手动运行）：

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec tsc --noEmit
pnpm build
pnpm --filter @venus/foreground-node start
```

构建必须加载项目环境变量。在 v0 VM 中 Bash 不自动加载它们，需由执行者安全加载 `/vercel/share/.env.project` 后构建，不能打印文件内容。初次未加载配置的构建曾在数据收集阶段报错，正确加载后生产构建通过，未用虚构数据库绕过。

隔离集成测试要求：`DATABASE_URL` 指向批准的测试分支；`VENUS_TEST_DATABASE_HOST` 与该 URL host 完全一致，`VENUS_SOURCE_DATABASE_HOST` 记录源库 host 并必须不同。`tests/isolated-db.mts` 拒绝默认未显式指定的目标。只在隔离分支运行 `pnpm test:integration`；测试按随机 protocol-test/settlement-test 所有者与专属 auth 测试用户清理，不在父分支跑 DELETE 脚本。

本轮隔离主机为 `ep-calm-union-au7nymzl.c-10.us-east-1.aws.neon.tech`，没有把连接密码写入仓库。测试分支保留用于复验，未擅自删除分支；它包含父分支快照，按与父分支相同的访问控制处理，后续销毁需明确授权。

部署顺序：审核和批准增量 DDL → 隔离验证 → 应用结构 → 发布代码 → 已授权域名认证走查 → 本机实机任务验收 → Workflow 恢复验收。当前对话没有发布部署，也没有直接推送 main；改动在功能分支通过 v0 的 Git 同步保存。

回滚优先回退代码但保留新增审计/结算表。**不要直接恢复旧的会覆盖结算终态的取消逻辑或没有新分录语义的账本代码继续写账**；若必须回退，先停止新任务和财务写入，再审核兼容性。不得清空数据库、删除新增审计或自动回滚历史余额。

## 12. 验收记录

本轮校验环境：Linux VM、Next.js 16.3.3、pnpm 10.34.3；真实隔离 Neon 分支，不对父分支跑协议或账本写入测试。

| 验收项 | 结果与局限 |
| --- | --- |
| 原有单元基线 | 23 项通过 |
| 扩展单元测试 | 认证配置、邮件失败/HMAC、能力降级、路径/符号链接/覆盖/媒体头、下载限长/数量/清理、模板映射、取消、领取重试；最终数量以最终测试输出为准 |
| 隔离 Neon 协议与财务测试 | 授权、跨用户拒绝、同键提交/领取、并发上限、过期/fence、取消、结果冲突、核验、退款、解冻、调度竞争、余额守恒均通过；未调用真实模型 |
| 隔离 Better Auth | 真实注册/密码登录、会话重新读取、HttpOnly/Secure/SameSite=None、退出后会话失效、429 和持久化计数通过；Cloudflare siteverify 使用测试进程内响应桩，不能替代真实供应商验收 |
| TypeScript | `pnpm exec tsc --noEmit` 通过 |
| 生产构建 | 加载已有项目环境后通过，两个 Workflow、六个编译步骤被识别 |
| frozen-lockfile | 通过；没有依赖版本调整，也没有 syncpack 策略配置 |
| 浏览器 desktop | 710×618、light，退出与登录页面实际走查；110200 错误呈现，按钮失败关闭；已有会话退出后不能读取个人接口 |
| 浏览器 mobile | 390×844、light，密码/OTP 切换和受阻状态可读，无横向布局溢出 |
| 新登录→结果弹窗完整浏览器闭环 | **未通过验收/被外部域名授权阻塞**；不能把后端测试当成完整 UI 成功证据 |
| Ollama/FFmpeg/ComfyUI | **未实机验证**；FFmpeg 不在 VM PATH，媒体测试只验证边界/协议和受控测试响应 |
| Workflow 真实七天/部署重启 | **未验证**；测试通过调整隔离 fixture 到期时间验证数据库条件，不声称等待过七天 |

浏览器证据文件：`/tmp/agent-browser/venus-sign-in-safety.png`、`venus-auth-domain-check.png`、`venus-auth-mobile.png`。截图在临时验证目录，不作为用户资产提交。验收时需重新生成，不依赖临时下载链接。

### 配置完成后的人工闭环

1. 在已授权域名使用真实密码或邮箱 OTP 登录，刷新后仍保有会话，退出后个人 API 返回 401。
2. 在 Windows/macOS Node 24+ 实机前台配对，先验证默认不接单，再分别启用本机与平台文本策略。
3. 创建至少三条自有节点任务，验证同键请求、暂停、续租失败、重复回传和结果顺序；核实实际后端运行次数。
4. 接受一条、拒收一条、取消未派发条目；检查整单二次确认、预算归零、原始证据不丢、重复确认无重复分录。
5. 通过隔离测试模拟到期与工作流重复唤醒；生产环境验证 Workflow 正常启动、等待与恢复，不修改生产到期时间做加速测试。
6. 媒体模式审查本地模板/根目录，实际验证合法 MP4/WebM 和 ComfyUI 成品，确认未授权路径不发生读写；检查强制退出后后端是否仍在运行。

## 13. 路线图与准入门槛

按依赖推进，而不是给出无依据的工期承诺：

1. **自有节点可运维化**：完成真实域名/邮件/OAuth（如启用）与 Windows/macOS 实机回归；加入独立巡检、告警、日志脱敏规范、数据保留与升级机制。退出与进程强制停止不能仅靠 Linux 测试推断。
2. **公开服务发现与跨用户撮合**：设备身份与能力证明、容量/地域/模型许可、节点信誉、争议处理、反作弊计量、完整 API 配额和 WAF、供应商服务条款。明确异步失败和副作用后再讨论故障转移。
3. **商业推理网关、路由、动态定价、缓存**：正式服务注册、请求签名、用量审计、排队/取消、账单对账、支付资质和模型转售许可；当前本机 adapter 不提供这些保证。
4. **企业区域与私有化**：租户/组织/角色模型、跨区数据授权、密钥托管、部署隔离、SLO/灾备与独立审计。选择地域或私有部署本身不自动满足合规。
5. **WhaleLink、DNA、硬件、工业场景、跨设备并行**：单独协议设计与威胁建模、内容/知识产权许可、设备安全认证、端侧强沙箱和各自验收门槛，不复用当前前台 CLI 的测试保证当生产背书。

### 路由评分设计约束（尚未实现）

每个维度先归一化到 [0,1]，权重非负且归一化；未知测量不能填入伪造高分。示意模型而非当前线上算法：

$$S_i=\sum_j w_j q_{ij},\quad w_j\ge0,\quad \sum_j w_j=1$$

若网络抖动按毫秒测量，其衰减时间常数也必须是毫秒；心跳新鲜度可用秒，但不能混用单位：

$$q_{jitter}=e^{-J_{ms}/\tau_{ms}},\qquad q_{fresh}=e^{-\Delta t_s/\tau_s}$$

权重、时间常数、样本窗口、异常值处理和路由迟滞必须经过真实工作负载校准后再启用。当前没有项目实测吞吐/延迟提升结论；第三方数字只能附来源和验证状态，不能当本项目基准。

缓存必须区分：仅存摘要/HMAC 用于幂等审计，与存储可复用的任务/结果内容。后者需要内容授权、租户隔离、密钥和过期删除策略。当前 resultHash 不是内容缓存，DuckDB 也尚未接入。

链上存证不等于法律确权或审计通过。测试积分、区域部署、隐私措辞不能替代资金、数据授权、模型厂商转售条款与当地法律的正式审查。
