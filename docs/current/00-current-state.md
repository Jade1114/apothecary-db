# 当前状态

## 当前阶段

当前项目处在“文件驱动的 Retrieval 主链路”阶段。

也就是说，系统已经开始以 Vault 中的原始文件为入口，生成标准化文档，写入 SQLite，切分 chunk，并把向量写进 sqlite-vec。

前端仍然是调试工作台，不是最终产品 UI。

当前前端已经从早期表单 demo 调整为 Vault Workspace 调试台：

- 文档列表
- 选中文档正文阅读
- 手动触发 Vault 同步
- RAG 查询与 evidence 展示

后端仍然是当前主要重构对象。

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

`GET /documents` 只返回在线可见文档的列表 metadata，不返回 `plain_text` 全文。

`GET /documents/:id` 返回单个在线可见文档详情，包括 `plain_text`。

## 当前核心保障

- 后端启动后会通过同步协调层自动触发一次全量扫描，并监听 Vault 文件变化。
- 删除文件后，`files` 保留 `deleted`，在线 `documents/chunks/chunk_vectors/sqlite-vec` 会清理。
- 未变化文件不会只凭 document 行跳过，会检查 chunk、chunk_vectors、sqlite-vec 点是否完整。
- 文件变化重建失败时，旧 document 和旧向量尽量保持可检索。
- `/documents` 和 vector search 只面向在线可见数据。
- 文档列表接口不会拉取整库正文，前端需要展示正文时再请求单文档详情。
- 旧 SQLite 库启动时会补齐当前查询依赖的 `documents.file_id/source_type/source_name` 等列。
- `documents.content` 和 `chunks.content` 兼容字段已经从主 schema 和主读写路径移除。

## 当前边界

本阶段不实现：

- 真正异步任务系统
- `document_blocks`
- 文件移动识别
- 复杂 ignore 规则
- RAG 生成侧优化
- Electron

这些都留给后续阶段拆分。

## 当前代码验证方式

后端测试：

```bash
cd backend
pnpm exec jest --runInBand
```

后端 lint：

```bash
cd backend
pnpm lint
```

后端构建：

```bash
cd backend
pnpm build
```

前端 lint：

```bash
cd frontend
pnpm lint
```

前端构建：

```bash
cd frontend
pnpm build
```
