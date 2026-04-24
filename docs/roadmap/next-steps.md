# 下一步路线

这份文档只记录从当前代码继续往前走的方向，不再重复历史计划。

## 当前建议顺序

### 1. 读代码并稳定当前心智模型

先按 `docs/current` 理解现有代码。

这一阶段不急着继续扩大功能面。

重点确认：

- 文件身份层是否清楚
- 标准文档层是否清楚
- chunk/vector 映射是否清楚
- scan/reconcile 的状态语义是否清楚

### 2. 清理和收紧 schema

旧兼容字段已经从主 schema 和主读写路径移除。

后续可继续检查：

- 是否要收紧 `documents.file_id` 的 nullable 设计
- 手动文本 ingest 是否继续保留
- `profiles` 是否暂时冻结或重新设计

### 3. 收紧文件状态机与中断恢复

当前 `files.status = active` 的写入时机偏早，`registerFile()` 在扫描/登记阶段就会把文件设为 `active` 并覆盖 `hash`。

后续集中处理时，需要把 `active` 收紧为全流程成功后的最终确认：

```text
发现文件
→ parse
→ normalized document
→ chunks
→ embedding
→ vector 写入
→ document ready
→ file active
```

重点问题：

- 处理成功前是否允许覆盖 `files.hash`
- 是否拆分 `observed_hash` 与 `indexed_hash`
- 是否引入 pending/processing/discovered 这类中间语义
- 进程中断后如何识别半完成状态并重新 reconcile
- 残留 `sync_jobs.status = running` 的启动恢复策略

### 4. 设计 watcher

建议先设计，不急着直接实现。

推荐方向：

```text
启动全量 scan
→ watcher 收集文件事件
→ debounce 合并事件
→ 投递 reconcile 请求
→ 后台同步队列处理
```

第一版 rename 可以先按 delete + new 处理。

移动识别后续再靠 hash/fingerprint 设计。

### 5. 设计异步同步 runner

当前 `sync_jobs` 是过程记录，不是任务队列。

后续如果要异步化，需要讨论：

- job 创建时机
- running/succeeded/failed 的恢复策略
- 应用重启后如何继续
- 并发锁和同一 file 的串行化
- UI 如何展示同步中和失败可重试

### 6. 再考虑 `document_blocks`

`document_blocks` 应该等 parser 和标准文档格式稳定后再做。

它适合解决：

- 标题层级
- 页码
- 段落/列表/代码块/表格结构
- chunk 与原文结构的映射

当前不急。

### 7. 最后再优化生成侧

Retrieval 数据稳定后，再处理：

- prompt
- answer 引用
- rerank
- rag query history
- profiles
- 更复杂的上下文组织

## 当前明确不做

- 不直接上 Electron
- 不把 watcher 和 async runner 混在一起一次做完
- 不提前实现 `document_blocks`
- 不重写生成侧
