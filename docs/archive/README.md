# 归档文档说明

这个目录保存历史设计、旧计划和已完成阶段的草稿。

这些文档不再作为当前代码事实入口。

如果你只是想理解当前代码，请先读：

- `../README.md`
- `../current/00-current-state.md`
- `../current/01-code-reading-guide.md`

## 归档内容

- `architecture.md`：早期整体架构说明，里面仍有 Qdrant 语境。
- `backend-modules.md`：早期 NestJS 模块设计说明。
- `execution-plan.md`：早期重构执行计划。
- `file-ingest-foundation-plan.md`：文件导入基础链路计划，主体已落地。
- `file-identity-foundation-plan.md`：文件身份层计划，主体已落地。
- `local-vault-architecture.md`：本地 Vault 模式早期设计，部分方向仍有参考价值。
- `normalized-document-and-sqlite-schema.md`：标准化文档和 SQLite 设计草稿，已压缩进 `current/03-data-model.md`。
- `sqlite-vec-refactor-plan.md`：从 Qdrant 到 sqlite-vec 的迁移计划，当前已完成 sqlite-vec 主链路。
- `vault-sync-state-machine.md`：同步状态机设计草稿，已压缩进 `current/04-sync-flow.md`。

## 阅读建议

只有在需要追溯“为什么当时这么设计”时再读归档文档。

归档文档中的表结构、执行顺序或 provider 描述可能已经过期。

