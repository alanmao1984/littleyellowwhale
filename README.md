<p align="center">
  <img src="https://xiaohuangjing.com/brand/venus-seal.png" width="180" alt="小黄鲸 Venus 圆形品牌徽章" />
</p>

<h1 align="center">小黄鲸 Venus</h1>

<p align="center"><strong>Venus · little yellow whale</strong></p>

面向 AI API、GPU 节点与智能体能力的算力流动性测试网络。Venus 将任务路由、节点执行、用量核验和测试结算放在同一套工作台中，让开发者调用可发现的能力，也让设备所有者在明确授权的前提下贡献闲置算力。

> 当前版本使用 **VTEST** 测试计价。VTEST 不可购买、提现、转账或兑换，不代表存款、货币、投资产品或收益承诺。

[访问 Venus](https://xiaohuangjing.com) · [进入控制台](https://xiaohuangjing.com/tasks) · [查看下载与版本](https://github.com/alanmao1984/littleyellowwhale/releases)

## 产品能力

- **任务与算力池**：创建文本及受限媒体任务，查看队列、执行状态和结果核验记录。
- **自有节点**：通过一次性配对码连接本机 Ollama、OpenAI-compatible 服务、FFmpeg 或专用 ComfyUI。
- **文本 API 市场**：提供模型目录、供给发布、原生异步作业及 OpenAI-compatible 非流式调用。
- **私有媒体处理**：素材存放于 private Blob，下载与回传均绑定节点、任务、attempt 和时效凭据。
- **组织算力**：支持成员角色、部门、成本中心、配额和组织内节点调度。
- **测试账本**：按服务端规则预留、核验、退款和分账，并保留可审计记录。
- **MCP 接入**：允许读取能力与测试账单、准备文本任务草稿，不允许直接执行或移动余额。

## 下载 Venus Node

Venus Node 是交互式前台节点，不安装常驻服务，不自动下载模型，也不修改防火墙。正式下载入口只会重定向到 GitHub 上已发布且经过校验的稳定安装包；如果对应平台尚无正式包，接口会返回“正在准备中”。

| 平台 | 下载 | 文件名 |
| --- | --- | --- |
| Windows x64 | [下载安装程序](https://xiaohuangjing.com/api/downloads/node/windows) | `venus-node-windows-x64-setup.exe` |
| macOS Apple Silicon | [下载安装包](https://xiaohuangjing.com/api/downloads/node/macos-arm64) | `venus-node-macos-arm64.pkg` |
| macOS Intel | [下载安装包](https://xiaohuangjing.com/api/downloads/node/macos-x64) | `venus-node-macos-x64.pkg` |

- [中文用户使用说明](docs/venus-node-user-guide.zh-CN.md)
- [English User Guide](docs/venus-node-user-guide.en-US.md)
- [查看安装包状态](https://xiaohuangjing.com/api/downloads/node)
- [浏览全部 GitHub Releases](https://github.com/alanmao1984/littleyellowwhale/releases)
- [下载最新公开源码 ZIP](https://github.com/alanmao1984/littleyellowwhale/archive/refs/heads/main.zip)（不包含客户端闭源接单核心，不能据此构建可运行核心）

安装后请使用 Release 中的 `SHA256SUMS` 校验文件。Windows 正式包应带代码签名；macOS 正式包应完成签名、公证和 stapling，无法满足签名策略的构建不会作为正式稳定版发布。

## 快速使用

### 1. 创建账户并进入工作台

打开 [Venus 控制台](https://xiaohuangjing.com/tasks)，注册或登录后进入任务中心。个人任务、节点、组织与账本数据均由服务端会话隔离。

### 2. 准备本机能力

启动一个受支持的本机服务：

- Ollama：例如 `http://127.0.0.1:11434`
- OpenAI-compatible：例如 `http://127.0.0.1:8000/v1`
- ComfyUI：例如 `http://127.0.0.1:8188`
- 视频任务：在节点授权时选择本机 FFmpeg

节点只接受 loopback 本机地址，不接受远程模型服务、地址中的凭据或重定向。

### 3. 配对 Venus Node

1. 在控制台打开“我的节点”，创建一次性配对码。
2. 启动已安装的 Venus Node，不带命令行参数进入交互流程。
3. 输入平台 HTTPS 根地址、本机服务地址、允许的模型或能力，以及本机并发上限。
4. 明确确认本次前台会话后，输入网页生成的一次性配对码。
5. 回到“我的节点 → 资源策略”，授权该节点可以接收的能力和任务范围。

节点凭据仅保留在当前进程内。按 `Ctrl+C` 退出后不会继续接单；需要在网页撤销节点，并在下次启动时重新配对。

### 4. 提交、核验与结算

在任务中心选择已授权能力并提交任务。执行完成后检查每条结果，选择接受或拒收，再完成整单处置；接受部分按测试规则分账，未执行或拒收部分按规则退回 VTEST 预留。

## 文本 API

获取具备 `market:invoke` 权限的令牌后，可以先读取当前可用模型，再提交非流式请求：

```sh
curl "https://xiaohuangjing.com/api/v1/models" \
  -H "Authorization: Bearer $VENUS_API_TOKEN"

curl "https://xiaohuangjing.com/v1/chat/completions" \
  -H "Authorization: Bearer $VENUS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $(uuidgen)" \
  -d '{
    "model": "从模型目录返回的模型名称",
    "messages": [{"role": "user", "content": "介绍一下 Venus"}],
    "max_tokens": 256,
    "stream": false
  }'
```

也可通过 `POST /api/v1/jobs` 创建原生异步作业，并使用作业 ID 查询或取消。当前 OpenAI-compatible 接口不支持流式 SSE。

## 本地开发

要求 Node.js 24+ 与 pnpm 10.34.3。应用运行需要 `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BLOB_READ_WRITE_TOKEN`、`RESEND_API_KEY`、`RESEND_EMAIL_DOMAIN` 及成对配置的 Turnstile 变量；不要将任何真实凭据提交到仓库。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

验证命令：

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

从源码运行前台节点：

```sh
pnpm --filter @venus/foreground-node start
```

## 技术架构

Next.js 16、React 19、Neon PostgreSQL、Better Auth、Vercel Workflow、Vercel Blob、Resend，以及 Node.js 24 前台节点。业务授权始终在服务端按会话、用户或组织成员身份执行；数据库事务是任务、用量、预留、配额与幂等的事实来源。

## 安全与范围

- 不要在提示词、媒体模板或本机路径中放置秘密；当前任务内容不是端到端加密。
- 媒体能力仅执行固定模板和本机明确批准的目录，不支持任意 shell、远程 URL 或 FFmpeg 参数。
- 当前项目仍是测试网络，不承诺生产 SLA、真实支付、法币结算、提现或收益。
- 对公网提供服务前，应完成实际域名认证、设备实机、模型许可、监控告警、争议处理和数据保留策略验收。

## 进一步阅读

- [Venus Node 中文用户使用说明](docs/venus-node-user-guide.zh-CN.md)
- [Venus Node User Guide (English)](docs/venus-node-user-guide.en-US.md)
- [ECS 主站与 Vercel 自动灾备运维手册](docs/ecs-vercel-disaster-recovery.md)
- [Venus v2.2 开发说明](docs/venus-development-v2.2.md)
- [Venus v2.1 开发与验收基线](docs/venus-development-v2.1.md)
- [节点发布工作流](.github/workflows/release-node.yml)

## License

仓库目前未声明开源许可证。除非权利人另行授权，请勿假设代码可被复制、修改或重新分发。
