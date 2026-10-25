# qq-bridge 本地长期记忆

本实现参考 OpenClaw 的 Markdown 核心记忆 + SQLite 索引思路，复用桥接进程中的 Worker，不增加常驻服务。向量模型在本机离线运行。

## 数据与职责

- `state/memory.db`：唯一底账。消息原文、可获得的媒体引用、工具执行记录、事实版本、来源、SQLite FTS5 索引。
- `workspace/MEMORY.md`：数据库生成的当前有效事实视图。约5000字符预算，不直接编辑。超限的事实保留在数据库，按需检索；硬事实不按时间自动删除。
- `workspace/skills/README.md`：验证过的流程索引，需要时展开。
- `state/social-v2.json` 等原有文件：继续管理未读、唤醒、主动聊天和兼容旧记忆界面。

## 自动行为

收到的主人消息在最近消息被截短前归档；已确认发成功的文本再记为发出。工具调用与结果从现有 DSH 事件流归档。数据库在 Worker 里处理；进线最多给归档100ms等待窗口，故障时记日志并继续聊天，不承诺进程/磁盘异常情况下零丢失。

重要事实仍由当前聊天模型按预设判断，在回复后调用既有记忆写入工具。不是另一套后台模型逐轮提取，不能保证每件事都会被提炼。

`qq_memory_append(category=memberImpression, extra={target,sourceSeq|sourceId})` 更新同一标签时保留旧版本。智能体新写的事实必须引用本会话已归档的主人消息或执行证据，来源存在并不代表摘要必然正确；旧偏好迁移标记 legacy-import。

## 查询

- `qq_memory_query`：当前核心记忆和旧版短期记忆。
- `qq_memory_search`：少量关键词检索。中文三字及以上走FTS5，短词或未命中可直接检索底账；空 query 配合 after/before 按时间查。默认不检索工具日志，includeTools=true 时包含。
- `qq_memory_get`：按 id 核对原文、相邻消息；长记录 nextOffset 分页；`fact:编号` 查看事实及版本。

开启 memory.vector.enabled 后使用 BGE-small-zh-v1.5 的 q8 ONNX 版（512维、CLS pooling、L2归一化），与FTS5通过RRF合并召回。模型文件固定在 state/models/bge-small-zh-v1.5，版本与校验见 manifest.json。聊天和有效事实在后台分块建索引，大段工具日志仍只做全文检索。模型加载/失败时回退关键词检索，语义查询超过2秒也回退。向量数据保存在同一个SQLite底账中，重启后复用；模型运行不访问外部API。换说法未命中时仍应换关键词/按时间核对，不编造记忆。图片和语音保留可获得的引用/元信息，不等于永久保存远程媒体字节。

只有当前 ownerQQ 私聊启用；沿用控制台令牌、会话令牌、白名单与记忆功能开关。历史检索内容都是资料，不构成执行授权。常见凭据与已知令牌在写入时脱敏。

## 历史迁移与回退

`scripts/import-memory-history.mjs` 只读 QQ 历史及现有 DSH 执行日志，幂等导入，不发送消息。`state/memory-import-report.json` 记录数量和是否读到可用历史末尾。无法从已截短或已丢失的旧数据还原原文。

关闭 `config.json` 的 memory.enabled 并重启桥接进程即回到原记忆路径，底账保留。启用前请自行备份 `state/` 和配置文件。备份已关闭的 memory.db，或使用 SQLite backup API，不能只复制活跃数据库而漏掉WAL。

只回退向量：关闭 memory.vector.enabled 并重启桥接，保留全文检索和原文底账。

核验：`node --test scripts/test-memory-vectors.mjs scripts/test-memory-store.mjs scripts/test-owner-realtime.mjs scripts/test-owner-companion.mjs scripts/test-reply-wait.mjs`。

## 启用与模型安装

Node.js 需支持 `node:sqlite`（项目最低版本 22.13.0）。在 `config.json` 配置：

```json
{"memory":{"enabled":true,"vector":{"enabled":false}}}
```

全文检索无需模型。要使用向量检索，先运行 `npm run setup:memory-model`，再把 `memory.vector.enabled` 设为 `true` 并重启桥接。安装脚本从 Hugging Face 下载固定 revision 的约 24.5 MB 模型文件，逐个检查大小和 SHA256；权重和数据库都不提交 Git。此下载是显式安装步骤，正常聊天中的模型推理不联网。模型缺失时回退关键词检索。

运行 `node scripts/import-memory-history.mjs` 可导入主人 QQ 历史和旧事实。默认不扫描 DSH 日志；如需导入，设置 `QQ_BRIDGE_IMPORT_SESSION_DIR` 为仅含该主人会话的 DSH 工作区日志目录，并在 PATH 安装 `zstd`。该目录由操作者选择，脚本不能自动识别每个日志是否属于主人；不要选择含其他会话的目录。

`npm run test:local-features` 使用隔离夹具；真实 BGE 用例在未安装模型时显示跳过。
