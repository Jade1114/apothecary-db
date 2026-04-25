# 当前数据模型

## 当前核心模型

当前核心边界是 `5 + 1`：

- `files`
- `documents`
- `chunks`
- `vectors`
- `chunk_vectors`
- `sync_jobs`

其中 `vectors` 不是普通关系表，而是 sqlite-vec 虚拟表 `chunk_embeddings`。

## 表关系

```text
files
  └── documents
        └── chunks
              ├── chunk_vectors
              └── chunk_embeddings(sqlite-vec)

sync_jobs
  └── files
```

## `files`

原始文件身份表。

它表示 Vault 中的一个原始文件曾经被系统识别过。

关键字段：

- `path`
- `name`
- `extension`
- `kind`
- `size`
- `hash`
- `observed_hash`
- `indexed_hash`
- `observed_at`
- `indexed_at`
- `status`
- `last_seen_at`
- `deleted_at`
- `last_normalized_path`
- `normalized_retained_at`

当前状态：

- `active`
- `deleted`
- `error`
- `ignored`

当前语义：

- `observed_hash`：最近一次扫描看到的原始文件版本
- `indexed_hash`：当前已经成功完成 parse/index/embedding 的文件版本
- `hash`：兼容字段，当前跟随已索引版本，即 `indexed_hash`
- `active`：当前文件版本已经完成索引并在线可用
- `error`：最近一次同步失败，可能仍有旧 `indexed_hash` 对应的 stale 索引可用

`registerFile()` 只更新观测版本；处理成功后才由最终确认点写入 `indexed_hash/hash` 并设置 `active`。

删除只长期保留在 `files` 层。

## `documents`

标准文档主表。

它表示某个文件被 parser 处理后形成的一份在线标准文档。

关键字段：

- `file_id`
- `plain_text`
- `source_type`
- `source_name`
- `title`
- `source_path`
- `normalized_path`
- `parser_name`
- `parser_version`
- `parse_status`
- `index_status`
- `created_at`
- `updated_at`

当前状态：

- `ready`
- `stale`
- `failed`

`documents` 不长期保留 `deleted`。原始文件删除后，在线 document 会被清理。

## `chunks`

检索块表。

它保存真正送入 embedding 和 vector search 的文本块。

关键字段：

- `document_id`
- `chunk_index`
- `text`
- `token_count`
- `source_block_start`
- `source_block_end`
- `metadata_json`

当前还没有实现 `document_blocks`，所以 `source_block_start/source_block_end` 暂时是预留扩展位。

## `chunk_embeddings`

sqlite-vec 虚拟表。

它保存向量本身。

当前规则：

- 表名是 `chunk_embeddings`
- `rowid` 对齐 `chunks.id`
- 向量维度来自 `VECTOR_DIMENSION`

## `chunk_vectors`

关系型映射表。

它连接 `chunks` 与 vector store 中的向量点。

关键字段：

- `chunk_id`
- `vector_id`
- `provider`
- `dimension`

即使当前 sqlite-vec 使用 `chunks.id` 作为 rowid，仍保留这张表，方便后续替换 provider 或检查一致性。

## `sync_jobs`

同步过程表。

它不保存业务内容，只记录同步尝试。

关键字段：

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

`scanVault()` 开始时会把残留的 `running` job 标记为 `failed`，并把 `error_message` 写成 `interrupted`。

如果残留 job 关联了 `file_id`，对应 file 会被标记为 `error`，让后续 reconcile 走修复式重建，而不是误判为 unchanged。

## 可选或历史表

### `profiles`

当前代码仍保留 `profiles` 模块和表，但它不是当前主线。

后续如果继续推进，需要重新设计成面向 document/folder/project/vault 的衍生认知层。

### `document_blocks`

还没有实现。

它未来可以表示标准文档的结构块，比如 heading、paragraph、list、code、table。

它和 `chunks` 不同：

- `document_blocks` 贴近原文结构
- `chunks` 面向检索和 embedding

### `rag_queries`

还没有实现。

未来可用于记录问答历史和分析检索质量。
