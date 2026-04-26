# 文件同步流程

## 当前同步形态

当前已经有 watcher，但还没有异步任务 runner。

同步可以由 watcher 或 API 请求触发：

- `POST /ingest/file`
- `POST /ingest/vault-scan`

`sync_jobs` 当前是同步过程的 attempt log，不负责调度，也不是异步队列。

也就是说：

- `scan/parse/index/delete` 记录的是一次阶段尝试
- `pending` 暂时保留给后续 runner
- repair 不是独立 job type，而是 reconcile 重新执行 `parse/index/delete` 的原因

## 扫描触发源

当前后端有两种扫描触发源：

- 后端服务启动
- Vault 文件监听事件

两种触发源都会进入 `SyncCoordinatorService`。

## 启动扫描

后端启动后，`StartupSyncService` 会提交一次 startup scan：

```text
后端启动
→ StartupSyncService
→ SyncCoordinator.requestScan("startup")
```

启动扫描独立于 watcher。

即使 `APOTHECARY_WATCHER_ENABLED=false`，后端启动后仍然会请求一次 startup scan。

## watcher 流程

后端启动后会启动 Vault watcher。

第一版 watcher 只负责事件过滤和提交扫描请求：

```text
后端启动
→ 启动 watcher
→ 收集文件 add/change/delete 类事件
→ 忽略 .apothecary/.obsidian/node_modules 和明显无关文件
→ 向 SyncCoordinator 提交 scan 请求
```

watcher 不直接执行 parse/index/delete，也不直接调用 `scanVault()`。

watcher disabled 只表示不监听后续文件变化，不影响启动扫描。

## 同步协调层

`SyncCoordinatorService` 负责扫描请求的进程内调度。

当前规则：

```text
requestScan(reason)
→ debounce 合并短时间内的请求
→ 如果当前没有扫描，调用 scanVault()
→ 如果 scanVault() 运行期间又收到请求，记录 pending scan
→ 当前扫描结束后补跑一次 scanVault()
```

这样做可以保证：

- watcher 高频事件不会一事件一扫描。
- 同一进程内不会并发执行多个全量 scan。
- scan 期间发生的新变化不会丢。
- scan 失败后，后续请求仍然可以再次触发 scan。

真正状态推进仍然只发生在 `scanVault()` 和后续 reconcile 里。

## Vault 扫描流程

`scanVault()` 的当前流程：

```text
标记残留 running sync_jobs 为 failed/interrupted
→ 将关联 file 标记为 error，等待修复式 reconcile
→ 扫描 Vault 支持文件
→ 对每个 seen file 调用 registerFile
→ reconcile present file
→ 找出本轮没 seen 到的旧 file
→ reconcile deleted file
→ 返回扫描统计和明细
```

支持文件类型：

- `.txt`
- `.md`
- `.pdf`
- `.docx`

`.apothecary` 目录会跳过。

## present file reconcile

当文件存在时：

```text
registerFile
→ 判断 new / changed / unchanged
→ 如果需要处理，旧 document 先标记 stale
→ 如果不需要处理，检查索引健康
→ 健康则 skipped
→ 不健康或文件变化则 parse + index
```

fast path 不再只看 document 是否存在。

必须同时满足：

- file 是 `active`
- 只有一个关联 document
- document `parse_status = ready`
- document `index_status = ready`
- chunk 数量大于 0
- chunk_vectors 数量等于 chunk 数量
- sqlite-vec 点数量等于 chunk 数量

否则进入修复式重建。

修复式重建不会创建单独的 `repair` job。

它仍然复用正常阶段：

```text
parse
→ index
```

或者在文件缺失时执行：

```text
delete
```

## parse + index

parse 阶段：

```text
parser 读取原始文件
→ 生成 NormalizedDocument
→ 写入 .apothecary/normalized
→ files.last_normalized_path 记录路径
→ sync_jobs 记录 parse 结果
```

index 阶段：

```text
split chunks
→ embedding
→ 数据库事务
→ 保留原 documentId
→ 更新 documents
→ 删除旧 chunks / chunk_vectors / sqlite-vec 点
→ 写新 chunks
→ 写 sqlite-vec 点
→ 写 chunk_vectors
→ document 状态回到 ready
→ sync_jobs 记录 index 结果
```

embedding 在事务外完成。

真正替换旧索引发生在短事务内，避免新索引准备失败时先删掉旧版本。

## 失败语义

如果 parse 或 embedding 在事务前失败：

- 旧 document 和旧向量不动
- `sync_jobs` 记录 failed
- `files.status` 标记为 `error`

如果事务内失败：

- 事务回滚
- 旧 document/chunks/vectors 尽量保持可用

如果已有旧版本，当前会用 `stale` 表达“旧版本仍可作为回退检索内容”。

## 残留 running job 恢复

`scanVault()` 开始时会先处理上次异常退出留下的 `running` job。

恢复规则：

- 残留 `sync_jobs.status = running` 会被标记为 `failed`
- `error_message` 写入 `interrupted`
- 如果 job 关联了 `file_id`，对应 file 会被标记为 `error`
- 已经 `deleted` 的 file 不会被恢复成 `error`

这样做的目的不是立刻假装索引成功，而是让后续 reconcile 明确知道：

```text
这个文件曾经在处理过程中被中断
→ 当前 indexed_hash 不能被盲目信任
→ 必须重新检查并修复
```

当前恢复入口仍然挂在 `scanVault()` 开始处，还没有应用启动时自动触发的 runner。

## 同一文件进程内串行化

当前 `ingestFile()`、scan present reconcile 和 delete reconcile 会按文件路径做进程内串行化。

规则：

- 锁 key 是规范化后的绝对文件路径
- 同一文件后进入的同步任务会等待前一个任务结束
- 等待结束后重新 `registerFile()`，再判断是否需要处理
- 如果前一个任务已经成功索引，后一个任务会走 unchanged + skipped

这个锁只覆盖当前本地单进程 API 场景。

它不是跨进程锁，也不是 runner lease。后续 async runner 到来时，仍需要数据库级 lease 或等价机制。

## 文件版本确认语义

当前文件版本语义已经拆成两层：

- `observed_hash`：最近一次扫描看到的文件版本
- `indexed_hash`：当前已经成功索引的文件版本

`registerFile()` 只负责更新 `observed_hash/observed_at`，不会提前确认 `indexed_hash`。

处理成功后的最终确认点会执行：

```text
files.indexed_hash = files.observed_hash
files.hash = files.observed_hash
files.status = active
```

因此：

- `active` 表示当前观测版本已经完成 parse + normalized document + chunks + embedding + vector 写入。
- `observed_hash != indexed_hash` 时，即使路径和兼容 `hash` 看起来存在，也必须进入 reconcile。
- `hash` 暂时保留为兼容字段，语义跟随已索引版本。

这个设计用于消除下面的硬中断窗口：

```text
registerFile 已经看到新文件版本
→ 进程被 kill / 服务崩溃 / 断电
→ 旧 document 还没有标记 stale，也没有完成新索引
→ 下次扫描时 observed_hash != indexed_hash
→ 继续进入修复式 reconcile
```

仍待后续处理：

- 应用启动时主动触发同一套恢复 / scan 流程
- runner 级别的同一文件串行化规则

## 删除 reconcile

当 Vault 中某个已知文件本轮没有被扫描到：

```text
查找关联 documents
→ 删除 sqlite-vec 点
→ 删除 chunk_vectors
→ 删除 chunks
→ 删除 documents
→ files.status = deleted
→ files.deleted_at = now
→ 保留 files.last_normalized_path
→ 如存在标准化文档路径，记录 normalized_retained_at
```

删除语义只长期保留在 `files`。

标准化文档落盘文件当前选择保留，用于后续调试、回溯或重建策略设计。

## 当前未实现

- 异步队列
- retry 调度器
- 文件移动识别
- 复杂 ignore 规则
