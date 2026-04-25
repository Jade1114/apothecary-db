# P1 同步过程模型 RFC

## 目标

把 `sync_jobs` 从“同步过程审计记录”收紧成“可恢复的同步过程模型”。

P1 不追求 watcher、后台 runner、正式任务队列或 UI 产品化。P1 只解决当前同步 API 形态下的几个问题：

```text
一次同步尝试处于什么阶段？
失败后系统如何再次进入 repair？
同一个文件是否可能被重复处理？
running 残留如何在启动或 scan 前被收口？
```

## 当前状态

当前同步入口仍然是同步 API：

- `POST /ingest/file`
- `POST /ingest/vault-scan`

当前 `sync_jobs` 已经记录：

- `file_id`
- `job_type`
- `status`
- `error_message`
- `created_at`
- `updated_at`

当前 `job_type`：

- `scan`
- `parse`
- `index`
- `delete`

当前 `status`：

- `pending`
- `running`
- `succeeded`
- `failed`

当前代码里，`pending` 基本保留给未来异步 runner；同步 API 会直接创建 `running` job。

## 设计原则

1. `files` 表描述文件最终同步事实，`sync_jobs` 描述过程尝试。
2. P1 阶段不把 `sync_jobs` 直接升级成完整任务队列。
3. repair 的权威触发条件仍然来自文件事实：`files.status`、`observed_hash/indexed_hash`、索引健康检查。
4. 同一文件的串行化先解决当前 API 场景，不提前设计复杂分布式锁。
5. watcher 和 async runner 到来前，不把 `pending` 语义铺太满。

## 核心概念

### job attempt

`sync_jobs` 中的一行表示一次同步尝试。

它回答的是：

```text
系统曾经尝试对某个 file 做某个阶段的同步，结果是什么？
```

它不直接回答：

```text
这个 file 现在是否应该被处理？
```

后者仍由 reconcile 判断。

### reconcile need

是否需要 reconcile，由文件事实和索引健康决定。

触发条件包括：

- `files.status != active`
- `files.indexed_hash IS NULL`
- `files.observed_hash != files.indexed_hash`
- document 数量异常
- document parse/index 状态异常
- chunks / chunk_vectors / sqlite-vec 点数量不一致
- 文件从 Vault 中消失，需要 delete reconcile

### repair

repair 不是一种新的 job type。

repair 表示 reconcile 发现当前状态不可信，于是重新执行 parse/index 或 delete。

第一版不建议加入 `job_type = repair`，避免和 `parse/index/delete` 的阶段语义混在一起。

## 状态转换

### 同步 API 阶段

当前同步 API 可以继续使用直接 running 模式：

```text
create running
→ work succeeded
→ succeeded
```

失败时：

```text
create running
→ work failed
→ failed
→ error_message = 失败原因
```

异常退出后：

```text
running 残留
→ failed
→ error_message = interrupted
→ 如果有关联 file_id，标记 file 为 error
→ 下次 scan/reconcile 触发 repair
```

### future runner 阶段

`pending` 留给后续 runner：

```text
pending
→ running
→ succeeded
```

或：

```text
pending
→ running
→ failed
→ 等待 retry 或人工触发
```

P1 可以先不实现这套异步流，只在文档和类型上保留空间。

## job type 语义

### `scan`

表示一次 Vault 全量扫描尝试。

特点：

- `file_id = null`
- 负责发现 present file 和 missing file
- 本身不是单文件任务
- 失败只说明这次扫描失败，不代表某个具体文件一定失败

### `parse`

表示某个文件的一次 parse/normalized 写入尝试。

特点：

- `file_id` 必须存在
- 成功后文件会记录 `last_normalized_path`
- 失败后不应更新 `indexed_hash`

### `index`

表示某个文件的一次 chunks/embedding/vector 写入尝试。

特点：

- `file_id` 必须存在
- 成功后才能进入最终确认点
- 最终确认点写入 `indexed_hash = observed_hash` 和 `status = active`

### `delete`

表示某个文件的一次在线索引清理尝试。

特点：

- `file_id` 必须存在
- 成功后删除在线 document/chunks/vectors
- `files.status = deleted`
- 保留 `last_normalized_path`

## 同一文件串行化

P1 需要明确同一文件不能同时进入两个互相冲突的 reconcile。

冲突例子：

```text
scan A 正在 index file 1
scan B 同时也发现 file 1 需要 index
→ 两边都写 document/chunks/vector
→ 最终状态取决于时序
```

第一版建议：

- 在当前单进程 API 模式下，对同一 file path 或 file id 做进程内串行化。
- 串行化范围覆盖 `ingestFile()`、scan present reconcile、delete reconcile。
- 后进入的同文件任务等待前一个结束后，重新 `registerFile()` 并重新判断是否需要处理。

边界：

- 这不是跨进程锁。
- 这不是 runner lease。
- 这只解决当前本地单进程服务的重复处理窗口。

后续 runner 阶段再升级为数据库级 lease，例如：

```text
locked_by
lease_expires_at
attempt
```

## 失败与 retry

P1 第一版不建议做自动 retry 循环。

推荐语义：

- parse/index/delete 失败后，当前 job 标记 `failed`
- 失败原因写入 `error_message`
- 关联 file 标记为 `error`
- 下次 scan 或手动 ingestFile 再触发 repair

这样 retry 仍由 reconcile 驱动，而不是由 job 表自己调度。

后续 runner 阶段再考虑：

- retry count
- max attempts
- next_retry_at
- exponential backoff
- 人工 retry 入口

## 启动恢复

P0 已经在 `scanVault()` 开头处理残留 `running` job。

P1 可以把恢复入口进一步收口：

```text
应用启动
→ 标记残留 running 为 failed/interrupted
→ 标记关联 file 为 error
→ 可选触发一次 scanVault 或等待用户/API 触发 scan
```

如果不立即触发 scan，也必须保证下一次 scan 能 repair。

## 最小实现切片

### Slice 1：文档与状态约束

改动范围：

- 本 RFC
- `current/04-sync-flow.md`
- 必要时补充 `sync_jobs` 状态说明

验收：

- `sync_jobs` 是 attempt log 还是 queue 的边界清楚
- `pending` 的未来语义清楚
- repair 不新增 job type

### Slice 2：同一文件进程内串行化

改动范围：

- `IngestService`
- ingest controller 测试

验收：

- 同一文件不会被两个 scan/ingest 同时 index
- 后进入的任务会在等待后重新判断文件事实
- 不引入 watcher 或 runner

### Slice 3：启动恢复入口

改动范围：

- app bootstrap 或专门 recovery service
- `SyncJobsService`
- 测试

验收：

- 应用启动时能收口残留 `running`
- 关联 file 进入 `error`
- 后续 scan 能 repair

### Slice 4：失败重试入口设计

改动范围：

- 文档优先
- 可能增加手动 retry API 或复用 scan

验收：

- failed job 如何被再次处理有明确路径
- 不需要自动 retry runner

## 非目标

P1 不做：

- watcher
- 后台 runner
- 自动 retry 调度器
- 跨进程数据库锁
- 前端同步状态 UI
- job dashboard

## 开放问题

1. P1 是否需要新增数据库字段？

   初步建议不急。当前字段足够支撑 attempt log。runner 到来前先不加 lease/retry 字段。

2. 是否需要 `job_type = repair`？

   不建议。repair 是 reconcile 的原因，不是独立阶段。真正执行的还是 parse/index/delete。

3. 同一文件串行化按 path 还是 file_id？

   `ingestFile()` 在 register 前可能只有 path，delete reconcile 已有 file id。第一版可以统一用规范化后的绝对 path，后续 runner 再改成 file id + observed_hash。

4. 启动恢复是否自动触发 scan？

   可以分两步。先做启动时标记 interrupted，后续再决定是否自动 scan。这样风险更小。

## 完成标准

P1 完成时应满足：

- `sync_jobs` 的语义从“随手记一行”收紧成清晰的 attempt 模型。
- 同一路径文件不会在当前进程内并发重复 index。
- 残留 `running` 不依赖人工处理。
- failed job 能通过下一次 scan 或明确入口重新进入 repair。
- watcher/runner 仍然没有被提前混入当前实现。
