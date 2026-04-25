# Apothecary DB 文档入口

这套文档现在按“当前代码优先”重新整理。

如果你的目标是阶段性理解当前代码，请先只读 `current/`。`archive/` 里是历史计划和旧设计，不再作为当前实现事实。

## 推荐阅读顺序

1. [当前状态](current/00-current-state.md)
2. [代码阅读指南](current/01-code-reading-guide.md)
3. [当前架构](current/02-architecture.md)
4. [数据模型](current/03-data-model.md)
5. [文件同步流程](current/04-sync-flow.md)
6. [Retrieval 侧逻辑](current/05-retrieval.md)
7. [项目演进里程碑](roadmap/milestones.md)
8. [下一步路线](roadmap/next-steps.md)
9. [P0 可恢复索引内核 RFC](roadmap/p0-recoverable-index-kernel.md)
10. [P1 同步过程模型 RFC](roadmap/p1-sync-job-model.md)
11. [P2 文件监听最小方案](roadmap/p2-watcher-minimal.md)

## 文档分类

### `current/`

当前代码的事实说明。

这部分应该满足两个标准：

- 读完可以知道现在系统怎么跑
- 可以直接对照 `backend/src` 和 `frontend/src` 找代码

### `roadmap/`

下一阶段可能要做的事。

这里不记录已经完成的历史计划，只记录从当前代码继续往前走时需要讨论或拆分的方向。

推荐阅读顺序：

- 先看 [项目演进里程碑](roadmap/milestones.md)，建立整体阶段感
- 再看 [下一步路线](roadmap/next-steps.md)，理解当前建议顺序
- 然后看 [P0 可恢复索引内核 RFC](roadmap/p0-recoverable-index-kernel.md)，理解当前状态机地基
- 再看 [P1 同步过程模型 RFC](roadmap/p1-sync-job-model.md)，进入同步模型稳定化设计
- 最后看 [P2 文件监听最小方案](roadmap/p2-watcher-minimal.md)，理解自动同步第一版

当前实现已经围绕 [P0 可恢复索引内核 RFC](roadmap/p0-recoverable-index-kernel.md) 收紧了文件状态机、hash 语义和中断恢复。

同步过程模型见 [P1 同步过程模型 RFC](roadmap/p1-sync-job-model.md)，它约束 `sync_jobs` 语义、单文件串行化和失败重试入口。

下一阶段优先看 [P2 文件监听最小方案](roadmap/p2-watcher-minimal.md)，它把系统从手动扫描推进到自动监听 Vault 变化。

### `archive/`

历史计划、旧架构说明、已完成或已过期的设计草稿。

归档文档只用于追溯思路，不建议作为当前代码理解入口。

## 当前阶段一句话

项目已经从“手动文本 ingest demo”推进到“Vault 文件驱动的标准文档与检索索引主链路”阶段。

当前主线是：

```text
files
→ parser
→ normalized yaml + md
→ documents
→ chunks
→ sqlite-vec vectors
→ chunk_vectors
→ Retrieval
```

## 当前不在主线里的内容

- 真正异步 job runner
- `document_blocks`
- 文件移动识别
- ignore 规则
- RAG 的生成侧质量优化
- Electron 桌面壳
