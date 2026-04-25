# 下一步路线

这份文档记录从当前代码继续往前走的推荐顺序。

如果你想先看整体节奏，请先读 [项目演进里程碑](milestones.md)。
如果你想回看状态机地基，请读 [P0 可恢复索引内核 RFC](p0-recoverable-index-kernel.md)。
如果你想看当前下一阶段设计，请读 [P1 同步过程模型 RFC](p1-sync-job-model.md)。

## 当前建议顺序

### 1. Milestone A：可恢复索引内核

这是当前已经优先收口的地基。

当前主链路已经打通，但还存在一个关键工程风险：

- `registerFile()` 在扫描阶段就更新 `files.hash`
- `files.status = active` 的语义偏早
- 如果进程在 parse/index 前中断，下次可能把半完成状态误判为已完成

这一步的目标不是扩功能，而是把状态语义钉死。

重点处理：

- 拆开 `observed_hash` 和 `indexed_hash`
- 收紧 `files.status = active`
- 让 `scanVault()` 可以识别并修复半完成状态
- 给 `sync_jobs.status = running` 设计启动恢复策略

详细方案见 [P0 可恢复索引内核 RFC](p0-recoverable-index-kernel.md)。

### 2. 当前进入 Milestone B：同步模型稳定化

当 `files` 状态机稳定后，再收紧同步过程模型。

重点处理：

- `sync_jobs` 的生命周期是否足够表达恢复语义
- 同一 file 是否需要强制串行化
- 失败后如何重试
- repair reconcile 由谁触发

这一步的目标是把“同步过程记录”推进成“可恢复的同步模型”。

详细方案见 [P1 同步过程模型 RFC](p1-sync-job-model.md)。

### 3. 然后设计 Milestone C：watcher

建议先设计事件流，再开始实现。

推荐方向：

```text
启动全量 scan
→ watcher 收集文件事件
→ debounce 合并事件
→ 投递 reconcile 请求
→ 后台同步执行
```

第一版 rename 可以先按 delete + new 处理。

移动识别后续再靠 hash/fingerprint 设计。

### 4. 再做 Milestone D：异步同步 runner

当前 `sync_jobs` 仍然不是任务队列。

后续如果要异步化，需要集中讨论：

- job 创建时机
- running/succeeded/failed 的恢复策略
- 应用重启后如何继续
- 并发锁和同一 file 的串行化
- UI 如何展示同步中和失败可重试

建议在 watcher 事件模型清楚后，再接入后台 runner。

### 5. 最后做 Milestone E：结构与检索质量

`document_blocks` 应该等 parser 和标准文档格式稳定后再做。

它适合解决：

- 标题层级
- 页码
- 段落/列表/代码块/表格结构
- chunk 与原文结构的映射

Retrieval 数据稳定后，再处理：

- prompt
- answer 引用
- rerank
- rag query history
- profiles
- 更复杂的上下文组织

## 当前明确不做

在 `Milestone A` 和 `Milestone B` 完成前：

- 不直接上 Electron
- 不把 watcher 和 async runner 混在一起一次做完
- 不提前实现 `document_blocks`
- 不先重写生成侧
- 不先把精力投到 UI 美化或 prompt 调优
