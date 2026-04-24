# 文件同步流程

## 当前同步形态

当前还没有 watcher，也没有异步任务 runner。

同步由 API 请求触发：

- `POST /ingest/file`
- `POST /ingest/vault-scan`

`sync_jobs` 只记录执行过程，不负责调度。

## Vault 扫描流程

`scanVault()` 的当前流程：

```text
扫描 Vault 支持文件
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

- 应用启动时处理残留 `sync_jobs.status = running` 的恢复策略
- 同一文件并发 reconcile 的串行化规则

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

- watcher
- 异步队列
- retry 调度器
- 文件移动识别
- ignore 规则
