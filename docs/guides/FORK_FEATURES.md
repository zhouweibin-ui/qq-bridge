# Fork 新增功能

本 fork 在上游 `v0.2.1-r1` 基础上加入以下功能；运行配置、聊天原文、模型权重和私人角色卡不随代码发布。

## 主人专属助手

设置 `ownerQQ` 和原有私聊白名单后，在 `config.json` 显式设置 `socialV2.ownerCommandAccess: true`。重新运行 `node scripts/setup-dsh.mjs` 安装新增预设，并重启 DSH 与桥接。

二代仿真下，主人私聊选择 `qq-owner-v2`，保留主动聊天、唤醒协议和本机命令/文件工具。该预设不挂普通聊天的本机工具守卫，拥有实际本机执行权限；只能启用给可信主人。群聊和其他私聊继续使用原安全预设。执行任务时，主人新消息以 `steer` 投递，在工具调用间处理新要求；不能强行中断已运行的命令。

可选 `socialV2.send.immediate: true` 取消分条发送人工间隔；`socialV2.wake.batchWindowMs: 0` 取消唤醒前的消息合并等待。这两个参数作用于二代仿真整体，默认保留原节奏。`socialV2.wait.maxQuietMs` 单独控制等补充消息的静默上限，默认 120000ms，不再与长轮询总预算共用。

## 本地长期记忆

默认关闭。启用 `memory.enabled` 后，仅归档主人私聊和关联工具执行记录。SQLite FTS5 支持关键词、时间范围、原文分页与事实版本；可选 BGE q8 本机语义检索。安装模型、历史迁移和备份见 [长期记忆说明](../memory.md)。

## DSH Desktop 动态端口

安装 `qq-mode-console` 插件后，DSH 发布回环地址和进程 PID 到 DSH_HOME 下的 `qq-bridge-desktop-endpoint.json`，不写凭据。把该文件绝对路径填入 `dsh.desktopEndpointFile`，桥接会跟随端口变化并刷新 Cookie；非 HTTP 回环地址和失效进程记录被忽略。留空时使用 `dsh.baseUrl`。

## QQ 空间

新增 `qq_send_qzone` 和 `qq_get_qzone`，只允许主人私聊会话令牌使用。`socialV2.qzone.enabled: false` 或 `socialV2.tools.sendQzone: false` 可关闭。默认开启，每滚动 24 小时最多发布 5 条；`socialV2.qzone.maxPerDay` 可修改（0 表示不限）。发帖还检查二代模式、暂停、静默和会话准入。

发布默认所有人可见；私密内容使用 `ugcRight: 64`。需要 SnowLuma 实际支持相应接口。测试使用假网关，未据此证明线上空间发布可用；计数不是并发下的严格配额保证。

## 实验性豆包网页生图预设

`qq-doubao-image` 是独立执行预设，工具限于 `mcp__doubao-browser__*`，导航参数只允许豆包 HTTPS 域名，输出路径限制为仓库的 `state/doubao-jobs/`。不持有 QQ 会话令牌，也不挂本机命令/文件工具。

需要操作者另行配置同名浏览器 MCP、登录网页并传入任务，尚未接入自动 QQ 生图流程。`chrome-devtools-mcp` 依赖不会自动建立浏览器连接。守卫检查工具参数，不是浏览器网络沙箱；网页内部跳转和后台网络流量不能据此保证隔离。路径检查不防管理员预置的符号链接。

## 验证

```bash
npm run test:local-features
node scripts/test-agent-preset-patches.mjs
npm run test:audit
npm run privacy-scan
```

专项测试使用临时数据库与假 QQ/DSH；真实 BGE 用例需要预先安装模型，否则明确跳过。在线 DSH 适配和真实 QQ 收发仍需在部署环境验证。

### 2026-10-25 本机验证

- 新增功能专项 18/18 通过，包含真实本地 BGE 推理；预设生成契约、persona schema 和隐私扫描通过。
- 全量离线回归 38/43 个脚本通过。另 5 项在独立解包的上游提交 `a49877f` 上也复现：`test-preset-prompt` 假设源文件为 CRLF；`test-voice` 对 macOS realpath 别名断言不一致；`test-voice-system` 读取上游未发布的 `VOICE.md`；`test-console-encoding` 在 macOS 调用 Windows `chcp`；`test-preset-local-tools` 发现当前安装的 DSH 缺少 3 个旧工具名。
- 工具名扫描未发现未覆盖的危险工具候选，但仍有上述 3 个旧名字悬空。此项不能记为全绿，也没有据此宣称当前 DSH 的完整线上适配已经验证。
- 修正了启动脚本检出行尾约定，以及桥接行为测试中两处 macOS 临时目录别名断言。
- 没有运行会创建真实 DSH 会话的在线适配探针，也没有发 QQ 消息或空间内容。
