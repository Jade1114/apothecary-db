# 当前状态

## 当前阶段

当前项目处在“文件驱动的 Retrieval 主链路”阶段。

也就是说，系统已经开始以 Vault 中的原始文件为入口，生成标准化文档，写入 SQLite，切分 chunk，并把向量写进 sqlite-vec。

前端仍然是调试工作台，不是最终产品 UI。后端是当前主要重构对象。

## 已经打通的主链路

```text
Vault 文件
→ files 登记文件身份
→ parser 解析原始文件
→ .apothecary/normalized 落盘标准化文档
→ documents 保存标准文档正文
→ chunks 保存检索块
→ embedding 生成向量
→ sqlite-vec 保存向量点
→ chunk_vectors 保存 chunk 与 vector 的映射
→ Retrieval 查询召回 evidence
```

## 当前支持的入口

- `POST /ingest`
- `POST /ingest/file`
- `POST /ingest/vault-scan`
- `GET /documents`
- `GET /documents/:id`
- `POST /rag/query`
- `GET /health`

`POST /ingest` 是手动文本调试入口，当前主线已经转向 Vault 文件扫描。

## 当前核心保障

- 删除文件后，`files` 保留 `deleted`，在线 `documents/chunks/chunk_vectors/sqlite-vec` 会清理。
- 未变化文件不会只凭 document 行跳过，会检查 chunk、chunk_vectors、sqlite-vec 点是否完整。
- 文件变化重建失败时，旧 document 和旧向量尽量保持可检索。
- `/documents` 和 vector search 只面向在线可见数据。
- `documents.content` 和 `chunks.content` 兼容字段已经从主 schema 和主读写路径移除。

## 当前边界

本阶段不实现：

- 文件监听 watcher
- 真正异步任务系统
- `document_blocks`
- 文件移动识别
- ignore 规则
- RAG 生成侧优化
- Electron

这些都留给后续阶段拆分。

## 当前代码验证方式

后端测试：

```bash
cd backend
pnpm exec jest --runInBand
```

后端构建：

```bash
cd backend
pnpm build
```

前端构建：

```bash
cd frontend
pnpm build
```

