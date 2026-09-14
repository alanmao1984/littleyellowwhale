# ECS 主站与 Vercel 自动灾备

本手册用于将 `xiaohuangjing.com` 运行在阿里云 ECS，并让 Vercel 项目 `venus` 持续部署 GitHub `main` 的同一版本，作为 Cloudflare Load Balancing 的自动灾备源。

## 架构

| 角色 | 地址 | 版本来源 |
| --- | --- | --- |
| 主站 | ECS，`xiaohuangjing.com` | GitHub Actions 自动部署 `main` |
| 灾备 | Vercel，`backup.xiaohuangjing.com` | Vercel Git 集成自动部署 `main` |
| 故障切换 | Cloudflare Load Balancing | ECS 健康失败时切到 Vercel，恢复后回切 |

两端必须使用同一套 Neon、Blob、Resend、Turnstile 和 Better Auth 生产配置。`BETTER_AUTH_SECRET` 与 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` 必须一致，否则切换后既有会话或 Server Actions 可能失效。

## 一、首次准备 ECS

1. 安装 Docker Engine、Docker Compose plugin、Nginx、curl 和 rsync。
2. 创建目录：

```bash
sudo install -d -o "$USER" -g "$USER" -m 750 \
  /opt/littleyellowwhale/releases \
  /opt/littleyellowwhale/shared
```

3. 参照 `deploy/env.production.example` 创建 `/opt/littleyellowwhale/shared/.env.production`，权限设为 `600`。不要把该文件提交到 Git。
4. 必填主备配置：

```dotenv
BETTER_AUTH_URL=https://xiaohuangjing.com
AUTH_TRUSTED_ORIGINS=https://xiaohuangjing.com,https://www.xiaohuangjing.com,https://backup.xiaohuangjing.com
```

5. 生成固定的 Server Actions 加密密钥，并在 ECS 与 Vercel 使用同一个值：

```bash
openssl rand -base64 32
```

将结果保存为 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`。不要把值贴到聊天、Actions 日志或仓库。

6. 创建初始 upstream：

```bash
cat > /opt/littleyellowwhale/shared/nginx-upstream.conf <<'EOF'
upstream littleyellowwhale_app {
    server 127.0.0.1:3001;
    keepalive 32;
}
EOF
```

7. 参照 `deploy/nginx/littleyellowwhale.conf.example` 配置站点。若现有 Nginx 已定义 `$connection_upgrade`，直接复用；否则在 `http` 块加入：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
```

8. 为部署用户只授权部署脚本需要的 Nginx 命令：

```sudoers
DEPLOY_USER ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /bin/systemctl reload nginx
```

用实际用户替换 `DEPLOY_USER`，并通过 `visudo` 保存。部署用户还需有 Docker 权限和 `/opt/littleyellowwhale` 写权限。

## 二、配置 GitHub Environment

在仓库 Settings → Environments 新建 `ecs-primary`，配置：

| Secret | 内容 |
| --- | --- |
| `ECS_HOST` | ECS 公网 IP 或 SSH hostname |
| `ECS_PORT` | SSH 端口，通常为 `22` |
| `ECS_USER` | 专用部署用户 |
| `ECS_SSH_PRIVATE_KEY` | 对应部署公钥的私钥 |
| `ECS_KNOWN_HOSTS` | 在可信终端执行 `ssh-keyscan -p PORT HOST` 得到的完整记录 |

建议启用 Environment protection。工作流不会保存业务密钥；应用密钥只存在 ECS 的 `.env.production` 与 Vercel 环境变量中。

首次可在 Actions → Deploy ECS Primary → Run workflow 手动发布。成功后检查：

```bash
curl -fsS https://xiaohuangjing.com/api/status
```

应返回 `status=ready`、`role=primary`，且 `revision` 等于 GitHub `main` 的 SHA。

## 三、配置 Vercel 灾备

在 Vercel 项目 `venus`：

1. 添加 `xiaohuangjing.com`、`www.xiaohuangjing.com` 和 `backup.xiaohuangjing.com`。
2. 按域名页给出的实际 TXT 值在 Cloudflare 完成所有权验证；不要猜测 `_vercel` 的值。
3. 生产环境设置：

```dotenv
DEPLOYMENT_ROLE=disaster-recovery
BETTER_AUTH_URL=https://xiaohuangjing.com
AUTH_TRUSTED_ORIGINS=https://xiaohuangjing.com,https://www.xiaohuangjing.com,https://backup.xiaohuangjing.com
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=与ECS完全相同的值
```

4. 确认 Vercel Git Production Branch 是 `main`。
5. 让 `backup.xiaohuangjing.com` 直接指向 Vercel 域名页要求的记录，用于独立验收，不进入 ECS pool。

访问 `https://backup.xiaohuangjing.com/api/status`，应看到 `role=disaster-recovery` 和当前 SHA。

## 四、配置 Cloudflare 自动故障切换

Cloudflare Load Balancing 的能力和费用以账户控制台当前显示为准。

### Monitor

- Type：HTTPS
- Path：`/api/status`
- Port：443
- Expected status：`200`
- Header：`Host: xiaohuangjing.com`
- Timeout：5 秒
- Interval：60 秒（或账户允许的合适值）
- Retries：2
- Consecutive successes：2
- Follow redirects：关闭

### Pools

1. `ecs-primary`
   - Origin：ECS 真实源站 IP 或专用源站 hostname
   - Enabled：是
   - Monitor：上面的 HTTPS Monitor
2. `vercel-dr`
   - Origin：`venus-blond.vercel.app`
   - Enabled：是
   - Monitor：相同 Monitor
   - Host/SNI 按主域名 `xiaohuangjing.com` 配置，确保 Vercel 按已验证的自定义域名路由

先在 Pools 页面确认两端均为 Healthy。若 Vercel pool 不健康，先检查自定义域名所有权、Host header 和 TLS，不要接管主域名流量。

### Load Balancer

- Hostname：`xiaohuangjing.com`
- Default pool：`ecs-primary`
- Fallback pool：`vercel-dr`
- Traffic steering：Off（active-passive）
- Session affinity：Off
- Proxy：On

`www.xiaohuangjing.com` 通过 Cloudflare Redirect Rule 永久重定向到 apex。变更前记录当前 ECS DNS 原值，不要提前删除，便于紧急回退。

## 五、验收与演练

1. 正常状态访问主域名，`/api/status` 必须返回 `role=primary`。
2. 直接访问备用域名，必须返回 `role=disaster-recovery`。
3. 两端 `revision` 必须相同，页面、`/app`、登录和数据读取保持一致。
4. 在 Cloudflare 临时 Disable `ecs-primary` endpoint；等待健康阈值后，主域名应保持不变但返回 `role=disaster-recovery`。
5. 重新 Enable ECS endpoint；连续恢复成功后应自动回切，主域名再次返回 `role=primary`。
6. 在 ECS 创建低风险测试数据，再从备用域名读取，确认两端共享数据。

## 六、回滚与排障

- 候选容器只有通过数据库、认证、角色和 SHA 检查后才会写入 Nginx upstream；失败不会切走当前健康 slot。
- 当前和上一 slot 会同时保留。需要人工回切时，将 `/opt/littleyellowwhale/shared/nginx-upstream.conf` 指向另一端口（blue `3001`，green `3002`），执行 `sudo nginx -t && sudo systemctl reload nginx`。
- 查看容器：`docker compose --env-file /opt/littleyellowwhale/shared/deploy.env -f RELEASE/deploy/compose.yaml ps`。
- 查看日志：`docker logs --tail 200 littleyellowwhale-blue` 或 `littleyellowwhale-green`。日志不得复制到公开 Issue，先移除用户数据和内部地址。
- 如果两端同时返回 503，优先检查共享 Neon 或认证配置；Cloudflare 无法通过切换修复共享后端故障。
