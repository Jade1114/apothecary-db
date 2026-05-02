# 代码阅读指南

这份指南按“先理解主链路，再理解细节”的顺序组织。

## 1. 先看模块入口

从这里看系统由哪些模块组成：

- `backend/src/app.module.ts`

当前主要模块：

- `config`
- `database`
- `files`
- `parser`
- `documents`
- `sync`
- `sync-coordinator`
- `watcher`
- `ingest`
- `embedding`
- `vector`
- `rag`
- `llm`
- `profiles`
- `health`

## 2. 看配置与数据库

先看运行时关键路径：

- `backend/src/config/config.service.ts`
- `backend/src/database/database.service.ts`

重点理解：

- SQLite 数据库路径
- Vault 路径
- 标准化文档落盘路径
- embedding / llm 配置
- SQLite 表结构
- sqlite-vec 扩展加载

## 3. 看文件身份层

文件身份层回答“这个原始文件是谁”：

- `backend/src/files/files.service.ts`
- `backend/src/files/types/file.types.ts`

重点理解：

- 文件 path/size/status 以及 `observed_hash`/`indexed_hash` 如何记录
- 新文件、变化文件、未变化文件如何判断
- 删除文件如何保留 `files.status = deleted`

## 4. 看 parser 与标准化文档

parser 回答“不同文件格式如何变成统一文本”：

- `backend/src/parser/parser.service.ts`
- `backend/src/parser/normalized-document.service.ts`
- `backend/src/parser/types/normalized-document.types.ts`

重点理解：

- `txt/md/pdf/docx` 如何被解析
- 标准化文档如何写入 `.apothecary/normalized`
- `plainText` 如何成为后续入库输入

## 5. 看 documents 与 chunks

标准文档和检索块在这里落库：

- `backend/src/documents/documents.service.ts`
- `backend/src/documents/types/document.types.ts`
- `backend/src/documents/types/chunk.types.ts`

重点理解：

- `documents.plain_text` 是标准正文
- `GET /documents` / `listDocuments()` 只返回 metadata，不返回全文
- `GET /documents/:id` / `getDocumentById()` 才返回 `plain_text`
- `chunks.text` 是检索块正文
- `parse_status` 和 `index_status` 如何控制可见性
- 删除 document 时如何清理下游 artifacts

## 6. 看同步触发与协调

当前 watcher、启动扫描和手动 Vault scan 都通过同步协调层触发 scan：

- `backend/src/sync-coordinator/sync-coordinator.service.ts`
- `backend/src/sync-coordinator/startup-sync.service.ts`
- `backend/src/watcher/vault-watcher.service.ts`

重点理解：

- 启动扫描独立于 watcher 开关
- `POST /ingest/vault-scan` 也进入 `SyncCoordinatorService`
- watcher 只过滤事件并提交 `requestScan`
- `SyncCoordinatorService` 负责 debounce、串行 scan 和扫描中补跑
- watcher 不直接 parse/index/delete

## 7. 看同步编排

当前最重要的业务编排在这里：

- `backend/src/ingest/ingest.service.ts`
- `backend/src/ingest/ingest.controller.ts`
- `backend/src/ingest/types/vault-scan.types.ts`

建议重点读这几个方法：

- `scanVault`
- `reconcilePresentFile`
- `persistIndexedDocument`
- `isDocumentHealthy`
- `reconcileDeletedFile`

它们串起了文件扫描、parse、index、删除回收和 fast path 健康检查。

## 8. 看 sync_jobs

`sync_jobs` 记录同步过程尝试，不保存业务内容：

- `backend/src/sync/sync-jobs.service.ts`
- `backend/src/sync/types/sync-job.types.ts`

当前它不是异步队列，只是同步执行过程中的 attempt log。

读这部分时要注意：

- `pending` 主要留给后续 runner
- `repair` 不是独立 job type
- 是否需要重新处理文件，仍由 `files` 状态、hash 差异和索引健康检查决定

## 9. 看向量层

向量层通过接口隔离 provider：

- `backend/src/vector/vector-store.ts`
- `backend/src/vector/sqlite-vec.vector-store.ts`
- `backend/src/vector/types/vector.types.ts`

重点理解：

- sqlite-vec 表名是 `chunk_embeddings`
- sqlite-vec rowid 对齐 `chunks.id`
- `chunk_vectors` 是关系层映射表
- search 会过滤 deleted file 和不可见 document
- sqlite-vec 当前是本地同步实现，provider 写入/查询/删除接口也是同步边界

## 10. 看 Retrieval 与生成

当前 RAG 入口：

- `backend/src/rag/rag.service.ts`
- `backend/src/rag/rag.controller.ts`
- `backend/src/llm/llm.service.ts`

当前阶段重点是 Retrieval。`RagService` 仍然会在有 evidence 时调用 LLM，但生成质量不是本阶段优化重点。

## 11. 看前端调试台

前端主要用于触发和观察：

- `frontend/src/App.tsx`

它目前提供：

- Vault 扫描
- 文档列表
- 单文档正文阅读
- RAG 查询
- evidence 展示
