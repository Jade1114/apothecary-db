# P0 可恢复索引内核 RFC

## 目标

把项目从“Vault 文件主链路能跑”推进到“状态一致、可恢复、可继续演进”。

P0 不追求 watcher、后台 runner、UI 产品化或检索质量优化。P0 只解决一个核心问题：

```text
系统必须知道某个文件版本是否已经成功完成 parse/index/embedding。
即使进程中断、任务失败或重复 scan，也不能把半完成状态误判为已完成。
```

## 当前问题

当前 `registerFile()` 在扫描到文件时会立即更新 `files.hash`，并把 `files.status` 写成 `active`。

这导致 `active` 和 `hash` 同时混入两种含义：

- 最近一次扫描看到的原始文件版本
- 当前已经成功索引并可用于检索的文件版本

危险窗口：

```text
文件发生变化
→ registerFile 更新 files.hash/status
→ 进程中断
→ document/chunks/vector 仍是旧版本
→ 下次 scan 看到 hash 已匹配
→ 可能误判 unchanged 并跳过重建
```

P0 要消掉这个窗口。

## 设计原则

1. 当前事实和过程状态分开。
2. 观测到的文件版本和已索引的文件版本分开。
3. `active` 只能代表最终确认，不能代表“刚刚扫描到”。
4. `sync_jobs` 可以记录过程，但不能替代主表事实。
5. 所有 reconcile 操作必须幂等，重复执行不应破坏最终状态。

## 状态维度

### 文件事实层

`files` 表描述原始文件在系统里的身份和最终同步事实。

推荐字段：

```text
observed_hash       最近一次扫描到的文件 hash
observed_at         最近一次扫描确认文件存在的时间
indexed_hash        当前成功索引版本的文件 hash
indexed_at          当前成功索引版本确认时间
status              文件最终同步状态
deleted_at          文件确认删除时间
last_normalized_path
normalized_retained_at
```

当前已有 `hash` 字段。P0 迁移时建议：

```text
hash 先保留为兼容字段
indexed_hash 从 hash 回填
新代码优先读写 observed_hash / indexed_hash
等读写路径稳定后，再考虑移除或重命名 hash
```

### `files.status`

`files.status` 不再承载临时过程态。

推荐长期状态：

```text
active   当前 indexed_hash 对应的索引已完成且在线可用
error    最近一次同步失败；可能仍有旧 indexed_hash 可作为 stale 版本使用
deleted  原始文件已确认从 Vault 中消失，在线 document/vector 已清理
ignored  文件被规则排除
```

不建议长期塞入 `files.status` 的状态：

```text
discovered
pending
processing
indexing
```

这些应来自 `sync_jobs` 或 API 派生视图。

### 文档与索引层

`documents.parse_status` 表示标准化文档可用性：

```text
ready
stale
failed
```

`documents.index_status` 表示检索索引可用性：

```text
ready
stale
failed
```

语义：

- `ready`：当前 document/index 与 `files.indexed_hash` 对齐。
- `stale`：旧版本仍可用，但不代表最新 `observed_hash`。
- `failed`：当前没有可用结果，或最后一次构建失败且无旧版本兜底。

### 任务过程层

`sync_jobs` 记录一次同步过程。

状态：

```text
pending
running
succeeded
failed
```

P0 阶段可以继续同步执行 API，但 `sync_jobs` 必须开始承担恢复线索：

- 哪个文件正在处理
- 处理哪个阶段
- 失败原因是什么
- 是否存在启动时残留的 `running`

## 核心不变量

P0 实现后，系统应长期满足这些不变量：

1. `files.indexed_hash` 只能在 parse/index/embedding 全流程成功后更新。
2. `files.status = active` 只能在 `indexed_hash = observed_hash` 且 document/index 健康时写入。
3. `registerFile()` 可以更新 `observed_hash`，但不能提前覆盖 `indexed_hash`。
4. 如果 `observed_hash != indexed_hash`，该文件必须被视为需要 reconcile。
5. 如果存在残留 `sync_jobs.status = running`，启动后必须能识别并转入恢复路径。
6. `files.status = deleted` 后，在线 `documents/chunks/chunk_vectors/sqlite-vec` 不应继续暴露该文件内容。

## 推荐流程

### 扫描到新文件

```text
buildSnapshot
→ upsert files.path / observed_hash / observed_at
→ indexed_hash 为空
→ shouldProcess = true
→ parse
→ normalized document
→ chunks
→ embedding
→ vector 写入
→ document parse_status/index_status = ready
→ files.indexed_hash = observed_hash
→ files.indexed_at = now
→ files.status = active
```

### 扫描到已变化文件

```text
buildSnapshot
→ 更新 observed_hash / observed_at
→ observed_hash != indexed_hash
→ 旧 document/index 标记 stale
→ parse/index 新版本
→ 成功后 indexed_hash = observed_hash
→ document/index ready
→ files.status = active
```

如果失败：

```text
observed_hash 保留新版本
indexed_hash 仍指向旧成功版本
旧 document/index 保持 stale 或 ready-to-query
files.status = error
sync_jobs failed
下次 scan/retry 继续发现 observed_hash != indexed_hash
```

### 扫描到未变化文件

```text
buildSnapshot
→ observed_hash = indexed_hash
→ 检查 document/index 健康
→ 健康则 skipped
→ 不健康则 repair reconcile
```

健康检查至少包括：

- `files.status = active`
- 只有一个在线 document
- `parse_status = ready`
- `index_status = ready`
- chunks 数量大于 0
- chunk_vectors 数量等于 chunks
- sqlite-vec 点数量等于 chunks

### 文件删除

```text
本轮 scan 未看到已知文件
→ 删除 sqlite-vec 点
→ 删除 chunk_vectors/chunks/documents
→ files.status = deleted
→ files.deleted_at = now
→ 保留 observed_hash/indexed_hash 作为历史线索
→ 保留 last_normalized_path
```

### 删除后恢复

如果同一路径文件重新出现：

```text
buildSnapshot
→ status 从 deleted 进入待 reconcile
→ observed_hash 更新
→ indexed_hash 不能直接信任
→ shouldProcess = true
→ 全流程成功后 active
```

## 启动恢复

应用启动时需要做一次恢复扫描。

第一版恢复规则：

```text
查找 sync_jobs.status = running
→ 标记为 failed，error_message = interrupted
→ 找到对应 file
→ 如果 file.status != deleted
   → 触发或排入 repair reconcile
```

同时应扫描这些半完成信号：

```text
observed_hash IS NOT NULL AND indexed_hash IS NULL
observed_hash != indexed_hash
files.status = error
document parse_status/index_status = stale
chunk_vectors 数量和 chunks 不一致
sqlite-vec 点数量和 chunks 不一致
```

P0 可以先不做真正后台队列，但至少要让下一次 `scanVault()` 能修复这些状态。

## 迁移方案

建议分三步。

### 迁移 1：添加字段

```sql
ALTER TABLE files ADD COLUMN observed_hash TEXT;
ALTER TABLE files ADD COLUMN indexed_hash TEXT;
ALTER TABLE files ADD COLUMN observed_at DATETIME;
ALTER TABLE files ADD COLUMN indexed_at DATETIME;
```

回填：

```text
observed_hash = hash
indexed_hash = hash
observed_at = last_seen_at
indexed_at = updated_at
```

### 迁移 2：切换读写路径

`registerFile()`：

- 写 `observed_hash`
- 写 `observed_at`
- 不再提前写 `indexed_hash`
- 不再提前把 `status` 设置为 `active`

`markProcessed()`：

- 设置 `indexed_hash = observed_hash`
- 设置 `indexed_at = CURRENT_TIMESTAMP`
- 设置 `status = active`

`shouldProcess`：

```text
observed_hash != indexed_hash
OR indexed_hash IS NULL
OR status != active
OR deleted_at IS NOT NULL
OR document/index 不健康
```

### 迁移 3：收口兼容字段

短期：

- `hash` 保持存在
- 成功索引时同步写 `hash = indexed_hash`

长期：

- 如果所有路径都改为读 `observed_hash/indexed_hash`，再决定是否删除 `hash`

## 最小实现切片

### Slice 1：字段与读写语义

改动范围：

- `DatabaseService`
- `FileRecord`
- `FilesService`
- `ingest` 相关测试

验收：

- 新字段存在并回填
- `registerFile()` 不再提前确认 indexed 版本

### Slice 2：成功确认点

改动范围：

- `FilesService.markProcessed`
- `IngestService.reconcilePresentFile`
- `persistIndexedDocument`

验收：

- 只有 index 成功后才写 `indexed_hash`
- `active` 只在最终确认点出现

### Slice 3：恢复识别

改动范围：

- `SyncJobsService`
- `IngestService.scanVault`
- 可能新增 `RecoveryService` 或先放在 `SyncJobsService`

验收：

- 残留 running job 会被标记 failed/interrupted
- 下一次 scan 能识别半完成文件并重新 reconcile

### Slice 4：测试矩阵

新增或补强测试：

- 文件变化后在 parse 前中断
- 文件变化后在 index 前中断
- vector 写入失败后旧索引仍可用
- observed_hash 和 indexed_hash 不一致时不会 skipped
- running job 残留后重启能恢复
- 删除后恢复同路径文件会重新处理

## 测试矩阵

| 场景 | 预期 |
| --- | --- |
| 新文件首次 scan 成功 | `observed_hash = indexed_hash`，`status = active` |
| 文件变化但 index 失败 | `observed_hash != indexed_hash`，旧索引保留，`status = error` |
| 文件变化后进程中断 | 下次 scan 不能 skipped，必须重新 reconcile |
| unchanged 且索引完整 | skipped |
| unchanged 但 sqlite-vec 点缺失 | repair reconcile |
| 文件删除 | 在线 document/vector 清理，`status = deleted` |
| 删除后同路径恢复 | 重新 parse/index，成功后 `active` |
| 残留 running job | 启动恢复标记 interrupted，并触发修复 |

## 非目标

P0 不做：

- watcher
- 真正后台 runner
- 文件 rename/move 识别
- document_blocks
- retrieval 质量优化
- UI 产品化

## 开放问题

1. `files.status = error` 是否允许旧索引继续参与检索？

   建议允许，但 document/index 应标记 `stale`，前端或调试接口可以展示“当前最新版本同步失败，正在使用旧版本”。

2. 是否需要单独的 `file_sync_state`？

   P0 暂不建议落库。可以从 `sync_jobs` 和 hash 差异派生。等 P1/P3 做 runner 时再考虑是否需要面向 UI 的派生状态接口。

3. `hash` 字段何时删除？

   不急。先作为兼容字段保留，等所有读写路径稳定后再移除。

## 完成标准

P0 完成时应满足：

- 不再出现“扫描到新版本但未索引成功，却被误判 unchanged”的风险。
- 文件版本事实能通过 `observed_hash/indexed_hash` 解释清楚。
- `active/error/deleted` 的边界清楚。
- 服务异常退出后，后续 scan 或启动恢复能发现半完成状态。
- 测试覆盖主要中断和失败场景。
