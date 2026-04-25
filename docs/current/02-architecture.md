# 当前架构

## 架构定位

当前项目不是完整桌面产品形态，而是一个本地知识引擎的后端主链路。

重点是让文件进入系统后，可以稳定完成：

- 文件身份识别
- 标准化文档生成
- SQLite 持久化
- chunk 构建
- sqlite-vec 向量索引
- Retrieval 召回

## 分层

```text
Frontend
  React + Vite 调试工作台

Backend
  NestJS API 与业务编排

SQLite
  files/documents/chunks/chunk_vectors/sync_jobs

sqlite-vec
  chunk_embeddings 向量虚拟表

Model Providers
  OpenAI-compatible embedding / LLM
```

## 后端模块职责

### `config`

统一读取运行配置。

关键配置包括：

- `DATABASE_PATH`
- `APOTHECARY_VAULT_PATH`
- `EMBEDDING_*`
- `LLM_*`
- `VECTOR_DIMENSION`

### `database`

负责 SQLite 连接、sqlite-vec 扩展加载、schema 初始化和小型迁移。

所有模块都通过 `DatabaseService` 获取数据库连接。

### `files`

负责原始文件身份。

它记录文件路径、文件名、扩展名、大小、状态、删除时间，以及观测版本 `observed_hash` 和已索引版本 `indexed_hash`。

### `parser`

负责把原始文件转成标准化文档对象，并把标准化文档落盘为 `yaml + md`。

### `documents`

负责标准文档、chunks、chunk_vectors 的关系型数据读写。

它也负责 document 级联清理。

### `sync`

负责记录同步过程。

当前只有 `sync_jobs` 的最小同步审计能力，还不是异步任务系统。

### `ingest`

负责主流程编排。

它连接 `files/parser/documents/embedding/vector/sync`，完成扫描、导入、重建、删除回收。

### `watcher`

负责监听 Vault 文件变化。

它不会直接 parse/index/delete，只会 debounce 文件事件并触发 `IngestService.scanVault()`，让现有 reconcile 逻辑继续作为唯一权威入口。

### `embedding`

负责把文本转成向量。

当前通过 OpenAI-compatible API 调用 embedding provider。

### `vector`

负责向量存储抽象和 sqlite-vec 实现。

业务层依赖 `VectorStore` 接口，不直接依赖 sqlite-vec 细节。

### `rag`

负责 query 到 evidence 的检索流程，并在有 evidence 时调用 LLM 生成答案。

当前阶段只重点保证 Retrieval 数据正确性。

### `llm`

负责生成侧模型调用。

生成侧不是当前重构重点。

### `profiles`

历史 demo 能力仍保留，但不是当前主线。

后续如果继续做，应重构成更通用的衍生认知层。

## 依赖方向

推荐理解为：

```text
controller / watcher
→ ingest / rag
→ files / parser / documents / sync / embedding / vector / llm
→ database / config
```

`database` 和 `config` 是底座模块，不应该反向依赖业务模块。
