# 小黄鲸 Venus Node 用户使用说明（中文版）

适用版本：Venus Node 2.8.0 及后续兼容版本  
官方网站：[xiaohuangjing.com](https://xiaohuangjing.com)  
正式下载：[GitHub Releases](https://github.com/alanmao1984/littleyellowwhale/releases)

## 1. 客户端是什么

Venus Node 让你在本人明确授权时，把本机的 Ollama、OpenAI-compatible 服务、FFmpeg 或专用 ComfyUI 接入小黄鲸任务网络。

客户端仅以前台交互方式运行：

- 不安装系统服务或开机自启项；
- 不自动下载模型；
- 不修改防火墙；
- 不接受公网模型地址，只连接本机 loopback 服务；
- 退出终端或按 `Ctrl+C` 后停止领取任务。

公开仓库只包含网站、协议边界、安装器和发布流程，不包含客户端接单核心源码。外部源码构建不会生成或执行闭源核心；可运行客户端仅由本项目受保护的 GitHub Actions 从私有 Package 组装、签名并发布。不要从第三方下载所谓“完整核心”。

## 2. 系统要求

| 平台 | 支持范围 | 安装包 |
| --- | --- | --- |
| Windows | Windows 10/11 x64 | `venus-node-windows-x64-setup.exe` |
| macOS Apple Silicon | macOS 12+，M1/M2/M3/M4 | `venus-node-macos-arm64.pkg` |
| macOS Intel | macOS 12+，Intel x64 | `venus-node-macos-x64.pkg` |

你还需要：

- 可访问 `https://xiaohuangjing.com` 的网络；
- 一个 Venus 账户；
- 由你自行安装并启动的本机推理或媒体服务；
- 对所使用模型、素材和算力拥有合法授权。

## 3. 安全下载与校验

仅使用以下入口：

- [Windows x64](https://xiaohuangjing.com/api/downloads/node/windows)
- [macOS Apple Silicon](https://xiaohuangjing.com/api/downloads/node/macos-arm64)
- [macOS Intel](https://xiaohuangjing.com/api/downloads/node/macos-x64)
- [全部 GitHub Releases](https://github.com/alanmao1984/littleyellowwhale/releases)

若页面提示“正式安装包准备中”，表示对应平台尚未通过签名发布门禁。不要改用未签名构建或关闭系统安全检查。

每个正式 Release 都附带 `SHA256SUMS`。下载后进入文件所在目录并校验：

Windows PowerShell：

```powershell
Get-FileHash .\venus-node-windows-x64-setup.exe -Algorithm SHA256
Get-AuthenticodeSignature .\venus-node-windows-x64-setup.exe | Format-List Status,SignerCertificate
```

macOS：

```sh
shasum -a 256 venus-node-macos-arm64.pkg
pkgutil --check-signature venus-node-macos-arm64.pkg
spctl --assess --type install --verbose=2 venus-node-macos-arm64.pkg
```

Intel Mac 请将文件名改为 `venus-node-macos-x64.pkg`。SHA-256 必须与 `SHA256SUMS` 完全一致；Windows 签名状态应为 `Valid`，macOS 检查应显示受信任的 Developer ID 与成功评估。任何一项不符都不要安装，并在 GitHub Issues 报告 Release 链接和文件名，切勿上传账户令牌或配对码。

## 4. 安装

### Windows

1. 下载 `venus-node-windows-x64-setup.exe` 并完成上述校验。
2. 双击安装程序。
3. 确认发布者签名有效，再按向导安装。
4. 从开始菜单打开“Venus Node”；桌面快捷方式是可选项。

默认安装到当前用户的 `%LOCALAPPDATA%\Programs\Venus Node`，不要求管理员权限。

### macOS

1. 根据芯片下载正确的 `.pkg` 并完成上述校验。
2. 双击安装包，按系统安装器完成安装。
3. 打开“应用程序”中的 `Venus Node`。
4. 应用会打开 Terminal 并在其中运行前台节点。

正式安装包已经 Developer ID 签名、公证并 stapling。不要为了安装来源不明的软件而全局关闭 Gatekeeper。

## 5. 准备本机能力

启动至少一种客户端支持的本机服务，例如：

- Ollama：`http://127.0.0.1:11434`
- OpenAI-compatible：`http://127.0.0.1:8000/v1`
- ComfyUI：`http://127.0.0.1:8188`
- FFmpeg：使用节点流程中明确批准的本机可执行文件与目录

客户端只接受 `127.0.0.1` 或 `[::1]`。不要在地址中加入用户名、密码、API Key、query 或 fragment，也不要把本机服务直接暴露到公网。

## 6. 配对节点

1. 登录 [Venus 控制台](https://xiaohuangjing.com/tasks)。
2. 打开“我的节点”，选择 Windows 或 macOS。
3. 输入可选节点名称，点击“生成配对码”。
4. 启动 Venus Node，阅读终端中的权限和数据提示。
5. 按提示输入平台 HTTPS 根地址、本机服务地址、允许的模型或能力，以及本机并发上限。
6. 在本机明确确认后，输入网页显示的一次性配对码。
7. 回到“我的节点 → 资源策略”，只授权你愿意提供的能力、模型和任务范围。

配对码短时有效且只可使用一次。不要通过聊天、截图、工单或公开 Issue 分享配对码。节点凭据仅保留在当前客户端进程中；下次启动需要重新配对。

## 7. 运行与停止

保持 Venus Node 的 Terminal/终端窗口打开。节点只会领取已分配给它且符合资源策略的任务。

运行期间：

- 不要关闭本机推理服务；
- 不要移动已批准的媒体目录；
- 在网页“我的节点”中观察在线状态、模型和任务范围；
- 如需立即停机，按 `Ctrl+C` 或关闭终端；
- 如需阻止后续配对，在网页中暂停或撤销节点。

任务内容不是端到端加密。不要把密码、私钥、API Key、个人敏感信息或无权处理的数据放入提示词、媒体模板和路径。

## 8. Hermes（可选）

Hermes 只有在硬件、模型上下文和本机隔离条件满足时才可启用。启用后，Hermes 端口 `9119` 仅在 Docker 内网暴露，浏览器入口使用 `127.0.0.1:9120`，并由一次性平台授权保护。

在网页点击“打开 Hermes”时，平台生成短时单次链接并尝试打开本机入口。不要转发该链接。单节点 Hermes 的 sessions、memories 和 skills 是共享工作区，不应当作多用户强隔离环境。

## 9. 升级与卸载

升级时：

1. 用 `Ctrl+C` 停止旧客户端。
2. 从 GitHub Releases 下载更高版本的正式签名安装包。
3. 重新校验 SHA-256 和签名。
4. 直接运行新安装包覆盖安装，再重新配对。

Windows 可在“设置 → 应用 → 已安装的应用”卸载 Venus Node。macOS 可删除 `/Applications/Venus Node.app`。卸载应用不会替你删除 Ollama、ComfyUI、模型、Docker 数据或媒体文件；这些由设备所有者自行管理。

## 10. 常见问题

### 下载接口返回 503

对应平台没有可公开使用的正式签名稳定版。稍后查看 GitHub Releases，不要绕过签名门禁。

### 节点一直离线

确认客户端终端仍在运行、平台地址使用 HTTPS、系统时间准确、网络可以访问 `xiaohuangjing.com`，并重新生成一次性配对码。

### 无法连接本机模型服务

先在同一台电脑访问对应 loopback 地址；确认端口、模型名称和服务状态。客户端拒绝远程地址、带凭据的 URL 和重定向是正常安全行为。

### macOS 提示无法验证

先确认下载自官方 Release，并执行 `pkgutil` 与 `spctl` 检查。正式包仍无法验证时请停止安装并报告，不要使用 `xattr -dr` 或全局关闭 Gatekeeper 绕过问题。

### Windows SmartScreen 警告

先检查 Authenticode 状态与 SHA-256。正式包签名无效或发布者不符时立即停止，不要点击“仍要运行”。

## 11. 获取帮助

提交问题：[GitHub Issues](https://github.com/alanmao1984/littleyellowwhale/issues)

请提供平台、CPU 架构、客户端版本、错误原文和可公开的日志片段。发布前请删除用户名、本机路径、提示词、文件名、节点凭据、API Key、配对码和其他敏感信息。
