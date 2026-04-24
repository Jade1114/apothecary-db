# sqlite-vec 重构方案

## 1. 文档目的

本文档用于定义本项目后续从 `Qdrant` 迁移到 `sqlite-vec` 的重构方向、阶段目标和实现顺序。

这不是一次立即执行的“替换计划”，而是一份面向后续演进的正式方案。它的目的不是马上推翻当前可工作的 RAG 后端，而是确保系统在保持现有主链路可用的前提下，逐步演进到更适合本地桌面软件的向量存储形态。

---

## 2. 为什么考虑从 Qdrant 切到 sqlite-vec

当前项目已经基于 `Qdrant` 跑通了：

- 文档入库
- chunk 切分
- embedding 调用
- 向量写入
- RAG 检索
- LLM 基于 evidence 回答

从“能不能跑”的角度看，Qdrant 没有问题。

但从“这个软件后续要长成什么样”的角度看，Qdrant 有一个明显特点：

- 它更像一个独立服务，而不是一个天然嵌入在桌面软件内部的数据层。

这会带来几个后续问题：

- 软件需要依赖额外的向量服务进程
- 启动、关闭、端口、可用性都要额外管理
- 对桌面软件来说，整体部署形态偏重
- 它和“本地文件系统为知识根”的设计哲学不完全一致

而 `sqlite-vec` 的吸引力在于：

- 它更像向量世界里的 `SQLite`
- 它更适合单机、本地、嵌入式软件形态
- 它让结构化索引和向量索引更容易统一到一个本地底座里

一句话总结：

> 继续使用 Qdrant 更像“本地应用 + 外部向量服务”，而迁到 sqlite-vec 更像“以 SQLite 为统一索引底座的本地知识引擎”。

---

## 3. 当前状态

当前项目已经具备以下事实：

- `backend` 已经有独立 `vector` 模块
- `ingest` 和 `rag` 都通过 `VectorService` 使用向量能力
- 业务层没有直接操作 Qdrant client
- `embedding`、`vector`、`llm` 已经是相对独立的能力层

这说明架构上已经具备一个重要前提：

- 向量层**可以被替换**，而不会强行撕裂业务模块。

这也是为什么现在讨论从 `Qdrant` 迁到 `sqlite-vec` 是合理的。

---

## 4. 迁移目标

后续重构的目标，不是简单把“向量库换掉”，而是把整个系统的数据底座从：

- `SQLite + Qdrant`

逐步演进成：

- **`SQLite + sqlite-vec`**

最终达到的形态是：

- 文件系统：原始知识源
- SQLite：结构化业务数据 + 向量索引数据
- LLM / Embedding：能力层
- 前端 / Electron：交互层

也就是说，数据层后续尽量围绕一个本地统一底座收敛。

---

## 5. 重构原则

### 5.1 不打断当前已跑通的主链路

现在已经有真实可用的：

- `POST /ingest`
- `POST /rag/query`

所以后续迁移不能以“把当前链路推倒重来”为代价。

### 5.2 向量层必须保持可替换

后续任何实现都应通过统一的向量能力接口进入，不允许业务层直接依赖：

- Qdrant collection 概念
- Qdrant point 结构
- Qdrant REST client

### 5.3 先抽象，后迁移

不能先删除 `Qdrant`，再来思考新结构。顺序应当是：

1. 抽象稳定
2. 数据模型明确
3. 新实现落地
4. 双实现切换
5. 再决定默认 provider

### 5.4 先支持文本类主链路，不扩展过多边界

当前迁移只服务于：

- chunk 向量
- 相似检索
- evidence 召回

不要在这一阶段把：

- 多模态
- 图像向量
- 音视频内容理解
- 高级混合检索

混进来。

---

## 6. 当前问题在现有代码中的体现

当前向量写入和检索逻辑主要集中在：

- `backend/src/vector/vector.service.ts`
- `backend/src/ingest/ingest.service.ts`
- `backend/src/rag/rag.service.ts`

当前 `VectorService` 仍然是一个明确的 `Qdrant` 实现：

- `ensureCollection()`
- `upsertPoints()`
- `search()`

其中还包含了典型的 Qdrant 概念：

- collection
- point
- distance metric
- payload search

这在当前阶段没有问题，但如果要迁到 `sqlite-vec`，这些实现就应该被收敛为更抽象的向量能力接口，而不是继续作为“业务层默认事实”。

---

## 7. 重构总体路线

建议按四个阶段推进。

---

## 阶段一：抽象向量能力接口

### 目标

让业务层不再依赖 Qdrant 实现细节。

### 当前问题

当前虽然已经有 `VectorService`，但它本质上还是“Qdrant 版本的向量服务”，不是一个严格意义上的 provider 抽象。

### 建议做法

后续把向量层抽成更稳定的接口能力，例如：

- `initialize()`
- `upsertDocumentChunks(documentId, chunks)`
- `deleteDocumentChunks(documentId)`
- `searchSimilar(queryVector, options)`

或者继续保持现在的接口风格，但要确保这些方法不暴露 Qdrant 特有概念。

### 目标结果

`ingest` 和 `rag` 只知道：

- 我需要写入向量
- 我需要检索向量

而不知道底下是：

- `Qdrant`
- `sqlite-vec`
- 还是别的实现

---

## 阶段二：定义 SQLite 时代的向量数据模型

### 目标

在真正接 `sqlite-vec` 之前，先把数据模型定清楚。

### 建议的数据对象

后续建议在 `SQLite` 中逐步引入如下数据结构：

### 1. `files`

记录原始文件来源。

示例字段：

- `id`
- `path`
- `hash`
- `kind`
- `status`
- `updated_at`

### 2. `documents`

记录逻辑文档对象。

示例字段：

- `id`
- `file_id`
- `title`
- `content_text`
- `created_at`

### 3. `chunks`

记录文本切块。

示例字段：

- `id`
- `document_id`
- `chunk_index`
- `content`
- `token_count`
- `created_at`

### 4. `chunk_vectors`

记录 chunk 与向量索引之间的映射关系。

示例字段：

- `chunk_id`
- `document_id`
- `vector_status`
- `updated_at`

### 5. `profiles`

保存画像结果。

### 6. `rag_queries`

保存问答历史（后续可选）。

### 目标结果

在 `sqlite-vec` 接入之前，先明确：

- 哪些数据属于文件层
- 哪些数据属于 chunk 层
- 哪些数据属于向量层
- 哪些数据属于业务结果层

---

## 阶段三：实现 sqlite-vec provider

### 目标

新增一个真正的本地向量实现，而不是立刻删掉 Qdrant。

### 建议做法

不要直接删除当前实现，而是并行增加两套实现：

- `QdrantVectorService`
- `SqliteVecVectorService`

再通过配置决定使用哪一个。

### 配置建议

后续 `config` 中增加类似字段：

- `VECTOR_PROVIDER=qdrant`
- `VECTOR_PROVIDER=sqlite-vec`

### 目标结果

先让 sqlite-vec 跑起来，再决定何时切默认 provider。

---

## 阶段四：完成从双存储到单底座的迁移

### 目标

在 sqlite-vec 跑稳之后，让系统从：

- `SQLite + Qdrant`

逐步迁移到：

- `SQLite (+ sqlite-vec)`

### 最终效果

后续桌面软件的本地知识存储层将更统一：

- 文件系统：知识源
- SQLite：业务索引 + 向量索引
- 不再默认依赖 Qdrant 进程

这时系统会更像一个真正的本地软件，而不是“本地应用 + 外部向量服务拼装品”。

---

## 8. 模块层面的后续演进

当前已有模块：

- `config`
- `database`
- `documents`
- `profiles`
- `ingest`
- `embedding`
- `vector`
- `llm`
- `rag`

这些模块大方向没有问题。

后续建议在保持模块边界不变的前提下，重点演进：

### 8.1 `database`

从只保存 `documents/profiles`，逐步扩展为：

- files
- documents
- chunks
- profiles
- rag_queries
- vector mapping metadata

### 8.2 `vector`

从“Qdrant provider 模块”演进成：

- provider 抽象层
- Qdrant 实现
- sqlite-vec 实现

### 8.3 `ingest`

从“手动文本入库”演进成：

- 文档记录写入
- chunk 写入
- vector provider 写入
- 删除/重建索引能力

### 8.4 `rag`

保持作为：

- query embedding
- vector search
- evidence 召回
- llm answer

的编排模块，不受具体向量 provider 影响。

---

## 9. 为什么现在不应该立刻切掉 Qdrant

虽然长期方向建议迁移到 `sqlite-vec`，但当前阶段不建议立即切换，原因如下：

### 9.1 当前主链路已经跑通

当前系统已经能真实完成：

- `POST /ingest`
- `POST /rag/query`

这条闭环非常宝贵，不应该为了架构理想化而直接中断。

### 9.2 当前更大的价值在于继续推进软件本体

你现在真正需要继续推进的是：

- 本地知识库文件夹模式
- 文件同步模型
- 前端工作台演进
- 未来桌面形态

而不是重新花大量精力把当前可工作的向量层推倒重来。

### 9.3 当前抽象已经具备，切换条件成熟但不急于执行

换句话说：

- 现在已经可以开始设计 `sqlite-vec`
- 但不必现在立刻停用 `Qdrant`

---

## 10. 推荐执行顺序

建议后续按下面顺序推进：

### 第 1 步

继续保留当前可运行的 Qdrant 实现。

### 第 2 步

把向量层接口彻底抽象清楚，避免业务模块带入 provider 细节。

### 第 3 步

设计 SQLite 时代的：

- files
- documents
- chunks
- chunk_vectors

表结构。

### 第 4 步

实现 `SqliteVecVectorService`。

### 第 5 步

通过配置实现 provider 切换。

### 第 6 步

用小规模真实数据验证：

- ingest
- search
- delete by documentId
- reindex

### 第 7 步

确认稳定后，再切换默认 provider。

---

## 11. 最终目标架构

当前架构：

- 文件系统
- SQLite
- Qdrant
- Embedding / LLM
- Frontend

后续目标架构：

- 文件系统
- SQLite（结构化 + 向量）
- Embedding / LLM
- Frontend
- Electron（未来）

也就是：

```text
文件系统
   ↓
文件扫描 / 解析 / 同步
   ↓
SQLite
  ├─ files
  ├─ documents
  ├─ chunks
  ├─ vector index (sqlite-vec)
  ├─ profiles
  └─ query history
   ↓
RAG / Profile / Search / Answer
   ↓
Frontend / Desktop
```

这比当前的“本地应用 + 外部向量服务”更符合后续的本地知识引擎定位。

---

## 12. 结论

对本项目而言，后续从 `Qdrant` 迁移到 `sqlite-vec` 是一个方向正确的重构。

但这个重构不应被理解为：

- “换一个向量数据库”

而应被理解为：

- **把系统从“本地 app + 外部向量服务”演进成“以 SQLite 为统一本地索引底座的个人知识引擎”**

因此，建议策略是：

- 短期继续保留 Qdrant，维持当前主链路稳定
- 中期开始设计和实现 sqlite-vec provider
- 长期将默认向量层逐步收敛到更本地、更嵌入式的形态

这条路线既符合你当前的软件哲学，也不会破坏已经跑通的 MVP 主链路。
