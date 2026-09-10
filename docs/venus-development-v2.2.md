# Venus v2.2 开发说明

## 范围

v2.2 在 v2.1 自有节点、任务租约、fence 和 VTEST 账本上增加三条测试链路：公网文本 API 市场、private Blob 视频处理，以及企业/学校组织内部算力调剂。所有金额均为不可提现、不可兑换的 VTEST；本版本不包含真实支付、法币结算、生产 SLA 或流式 SSE。

## 文本 API 市场

- `POST /v1/chat/completions`：OpenAI-compatible 非流式接口。需要 `market:invoke` Bearer token，支持 `Prefer: respond-async` 和 `X-Request-Id` 幂等键。
- `POST /api/v1/jobs`、`GET /api/v1/jobs/:id`、`POST /api/v1/jobs/:id/cancel`：原生异步作业接口。
- `GET /api/v1/models`：返回当前 token 可见且 90 秒内有节点心跳的模型目录。
- `GET/POST /api/v1/offerings`：登录供应方查看、发布公开或组织模型供给。

调用先按服务端目录价格和最大输出预留 VTEST，再创建现有 `task`/`task_item`。节点结果必须匹配 attempt、fence、模型和 token 上限；usage 落入 `usage_records` 后，事务释放未使用预留，并按 85% / 5% / 平台剩余份额记录测试分账。请求正文只存在任务执行记录，不进入 API 调用日志或组织审计摘要。

## 私有视频链路

浏览器使用 `@vercel/blob/client` 直传至 private Blob。`POST /api/media/upload` 在签发上传 token 前校验登录用户、固定 pathname、MIME、声明大小和 SHA-256；完成回调重新流式计算真实摘要和大小，再写入 `media_assets`。客户端只使用 `/api/media/assets/:assetId`，该路由重新校验所有者并通过 `get(..., { access: "private" })` 流式返回，带 `private, no-cache`、ETag 和 Content-Disposition。

节点先向 `/api/node/media/authorize` 申请绑定 node、asset、task、attempt、fence、action、字节上限和 5 分钟有效期的一次性 token，再通过 `/api/node/media/download` 下载。节点只执行 `compress_mp4`、`resize_720p`、`resize_1080p` 三个固定模板；禁止任意 FFmpeg 参数、shell、远程 URL 和播放列表。成品通过 `/api/node/media/upload` 回传 private Blob，服务端再次校验 MIME、大小与 SHA-256，结果只引用 asset id。

## 组织算力

`organizations`、成员、邀请、部门、成本中心、配额、用量追加账和审计表承载组织域。所有读取和写入先以服务端 `organizationId + membership + role` 校验；Neon 无 RLS，因此 UI 可见性从不作为授权依据。

角色矩阵：Owner/Admin 管成员与结构；Operator 管节点和提交任务；Member 仅读取与提交授权任务。邀请通过 Resend 发送一次性哈希令牌，72 小时过期，接受时必须与当前登录邮箱一致。组织节点默认不进入公网，视频素材的数据出域策略默认为仅组织节点。

## 运行配置与恢复

需要 `DATABASE_URL`、`BETTER_AUTH_SECRET`、`BLOB_READ_WRITE_TOKEN`、`RESEND_API_KEY` 和 `RESEND_EMAIL_DOMAIN`。Blob store 必须保持 private。节点使用协议 v2 心跳声明 `private-blob-v1`；旧节点继续使用协议 v1 文本路径。

数据库事务是任务、预留、usage、配额与幂等的事实来源。节点只重试同一个结果 envelope，不重复推理；传输失败可重新申请一次性 token。Blob 回调、usage 和邀请均使用唯一键或 idempotency key 防止重复副作用。

## 验收证据边界

仓库验收包括单元测试、TypeScript、Workflow validate、生产 build、`git diff --check` 和真实浏览器响应式走查。没有真实第二账号、在线文本/FFmpeg 节点和真实素材时，只能确认协议、权限边界与界面就绪，不能宣称跨用户文本、视频处理或组织邀请的端到端生产闭环已经完成。
