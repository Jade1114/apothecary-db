# Retrieval 侧逻辑

## 当前关注范围

当前阶段重点是 RAG 里的 `R`，也就是 Retrieval。

目标是保证：

- 在线可见数据正确
- 删除文件不再被召回
- 损坏索引会被修复
- 指定 `documentId` 时检索范围正确

生成侧 `G` 暂时不是重点。

## 查询流程

`POST /rag/query` 当前流程：

```text
清理 query
→ embedding query
→ vectorStore.search
→ vector search 返回 evidence
→ 如果 evidence 为空，直接返回空 answer
→ 如果 evidence 存在，调用 LLM 生成 answer
```

虽然服务名仍叫 RAG，但当前重构重点只放在 evidence 的召回正确性上。

## vector search

当前 vector provider 是 sqlite-vec。

查询时会 join：

- `chunk_embeddings`
- `chunks`
- `documents`
- `files`

只召回满足下面条件的数据：

- `documents.parse_status IN ('ready', 'stale')`
- `documents.index_status IN ('ready', 'stale')`
- `files.status != 'deleted'`

手动文本 ingest 的 document 没有关联 file，所以也允许参与检索。

## `documentId` 范围过滤

`documentId` 过滤已经下推到 sqlite-vec 查询阶段。

这意味着：

- 有 `documentId` 时，`limit` 表示目标 document 内的 top K
- 不是先全局 top K 再在内存里过滤

## evidence shape

返回 evidence 包含：

- `id`
- `documentId`
- `chunkIndex`
- `content`
- `sourceType`
- `sourceName`

这里的 `content` 是 API 返回字段名，不是数据库旧字段。

数据库里的 chunk 正文字段是 `chunks.text`。

## 当前未优化

- answer 质量
- prompt 策略
- 引用格式
- 问答历史
- rerank
- hybrid search

这些属于后续 `G` 或 retrieval quality 的优化，不在当前主链路收敛范围内。

