# NestJS 后端模块设计

## 1. 文档目的

这份文档定义 `NestJS` 后端的模块划分、依赖关系和接口边界。

目标有三个：

1. 把后端从“能跑”整理成“能维护”
2. 让每个模块只管自己的事
3. 为后续接入更多模型、更多数据流留出扩展空间

---

## 2. 设计原则

### 2.1 一个模块只解决一类问题

不要把“文档管理”“向量检索”“模型调用”揉在一个 service 里。

### 2.2 Controller 只做接口层

Controller 负责：

- 接收请求
- 参数校验
- 返回响应

Controller 不负责：

- 编排复杂流程
- 直接访问多个底层资源
- 处理核心业务规则

### 2.3 Service 承担业务逻辑

业务逻辑应落在 service 中，并且尽量通过模块接口调用，不跨模块乱连。

### 2.4 基础能力模块向上提供服务

例如：

- `config`
- `database`
- `embedding`
- `vector`
- `llm`

这些模块更像“平台能力”，被上层业务模块依赖。

### 2.5 业务模块负责流程编排

例如：

- `documents`
- `profiles`
- `ingest`
- `rag`

这些模块面向具体业务场景，负责把基础能力组织起来。

---

## 3. 模块总览

```text
src
├─ health
├─ config
├─ database
├─ documents
├─ profiles
├─ ingest
├─ embedding
├─ vector
├─ llm
└─ rag
```

模块分组可以理解为：

### 基础设施模块
- `health`
- `config`
- `database`

### AI 能力模块
- `embedding`
- `vector`
- `llm`

### 业务模块
- `documents`
- `profiles`
- `ingest`
- `rag`

---

## 4. 模块职责说明

## 4.1 `health` 模块

### 职责

用于服务健康检查和基础运行状态暴露。

### 对外接口建议

- `GET /health`
- `GET /health/ready`
- `GET /health/dependencies`

### 依赖关系

- 可依赖 `database`
- 可依赖 `vector`
- 可依赖 `llm`
- 不应被业务模块依赖

---

## 4.2 `config` 模块

### 职责

统一管理系统配置，避免配置散落在各个模块里。

### 负责内容

- 读取环境变量
- 暴露数据库路径、Qdrant 地址、模型名称、超时等配置
- 提供类型化配置访问接口

### 依赖关系

- 尽量不依赖其他业务模块
- 作为全局基础模块被其他模块依赖

---

## 4.3 `database` 模块

### 职责

统一封装对 SQLite 的访问。

### 负责内容

- 连接本地数据库 `data/app.db`
- 提供查询、写入、事务等基础能力
- 初始化表结构或管理迁移入口
- 为上层模块提供结构化数据访问能力

### 依赖关系

- 依赖 `config`
- 被 `documents`、`profiles`、`ingest`、`rag` 使用

### 边界

`database` 提供的是“数据访问能力”，不是业务语义。

---

## 4.4 `documents` 模块

### 职责

负责文档资源的管理，是“文档主领域模块”。

### 负责内容

- 创建文档记录
- 查询文档列表、详情
- 更新文档状态
- 管理文档元信息
- 读取文档关联的分段信息

### 对外接口建议

- `GET /documents`
- `GET /documents/:id`
- `POST /documents`
- `PATCH /documents/:id`
- `DELETE /documents/:id`

### 依赖关系

- 依赖 `database`
- 可被 `ingest`、`rag`、`profiles` 依赖

### 边界

如果某个流程需要“导入文档并建立索引”，那是 `ingest` 的职责，不是 `documents` 的职责。

---

## 4.5 `profiles` 模块

### 职责

负责画像类结果的生成、保存和读取。

### 对外接口建议

- `GET /profiles`
- `GET /profiles/:id`
- `POST /profiles/generate`
- `PATCH /profiles/:id`

### 依赖关系

- 依赖 `database`
- 可依赖 `documents`
- 可按需要依赖 `llm`

### 边界

`profiles` 只解决“画像生成与读取”，不要把通用问答、检索流程并进来。

---

## 4.6 `ingest` 模块

### 职责

负责文档导入与索引建立流程，是整个系统的重要编排模块。

### 负责内容

- 接收导入请求
- 读取原始内容
- 清洗文本
- 切块
- 调用 embedding 生成向量
- 调用 vector 写入 Qdrant
- 将元数据和分段数据写入数据库
- 更新导入状态

### 对外接口建议

- `POST /ingest`
- `GET /ingest/:taskId`
- `POST /ingest/rebuild/:documentId`

### 依赖关系

- 依赖 `documents`
- 依赖 `database`
- 依赖 `embedding`
- 依赖 `vector`

### 边界

`ingest` 是流程编排模块，不应该把底层实现细节暴露给前端。

---

## 4.7 `embedding` 模块

### 职责

统一封装文本向量化能力。

### 代码层接口建议

- `embed(text: string): Promise<number[]>`
- `embedBatch(texts: string[]): Promise<number[][]>`

### 依赖关系

- 依赖 `config`
- 被 `ingest`、`rag` 使用

### 边界

对上只暴露“文本转向量”能力，不暴露供应商特定参数。

---

## 4.8 `vector` 模块

### 职责

统一封装 Qdrant 相关操作。

### 代码层接口建议

- `upsertPoints(points)`
- `deleteByDocumentId(documentId)`
- `search(queryVector, options)`

### 依赖关系

- 依赖 `config`
- 被 `ingest`、`rag` 使用

### 边界

`vector` 不应该知道完整业务流程，只负责向量库操作。

---

## 4.9 `llm` 模块

### 职责

统一封装大模型调用能力。

### 代码层接口建议

- `generate(prompt: string): Promise<string>`
- `chat(messages): Promise<string>`

### 依赖关系

- 依赖 `config`
- 被 `profiles`、`rag` 使用

### 边界

`llm` 只提供生成能力，不负责决定检索什么内容、拼什么上下文。

---

## 4.10 `rag` 模块

### 职责

负责检索增强生成流程，是面向用户问答的业务编排模块。

### 负责内容

- 接收用户问题
- 调用 `embedding` 生成查询向量
- 调用 `vector` 执行召回
- 根据命中的分段补充文档上下文
- 组装 prompt
- 调用 `llm` 生成回答
- 返回答案与引用来源

### 对外接口建议

- `POST /rag/query`
- `POST /rag/ask`
- `GET /rag/history`

### 依赖关系

- 依赖 `documents`
- 依赖 `database`
- 依赖 `embedding`
- 依赖 `vector`
- 依赖 `llm`

### 边界

`rag` 是完整问答流程的入口，但不应该把底层能力自己重写一遍。

---

## 5. 依赖关系建议

```text
config
├─ database
├─ embedding
├─ vector
└─ llm

database ─────┐
documents ────┼───── ingest
embedding ────┤
vector ───────┘

database ─────┐
documents ────┼───── rag
embedding ────┤
vector ───────┤
llm ──────────┘

database ─────┐
documents ────┼───── profiles
llm ──────────┘
```

原则：

- 上层业务模块可以依赖下层基础模块
- 下层基础模块不能反向依赖业务模块
- 业务模块之间尽量通过明确接口协作，避免循环依赖

---

## 6. 推荐接口边界

前端应优先调用这些接口：

- `/health`
- `/documents`
- `/profiles`
- `/ingest`
- `/rag`

前端不要直接调用：

- `/embedding`
- `/vector`
- `/llm`

因为这些属于内部能力，不是用户直接操作的业务对象。

---

## 7. 建议模块结构模板

```text
module-name
├─ dto
├─ types
├─ module-name.controller.ts
├─ module-name.service.ts
└─ module-name.module.ts
```

例如：

```text
rag
├─ dto
│  └─ query-rag.dto.ts
├─ rag.controller.ts
├─ rag.service.ts
└─ rag.module.ts
```

---

## 8. 当前阶段落地建议

根据当前仓库状态，建议按下面顺序推进：

1. 先补齐基础模块：`health`、`config`
2. 稳住 `database` 的连接与路径管理
3. 把已有 `documents`、`profiles`、`ingest` 边界收紧
4. 再新增 `embedding`、`vector`、`llm`
5. 最后组装 `rag`

---

## 9. 本阶段结论

你可以用一句话记住：

- `documents` 管文档
- `profiles` 管画像
- `ingest` 管导入编排
- `embedding` 管向量化
- `vector` 管 Qdrant
- `llm` 管生成
- `rag` 管问答编排
- `database` 管 SQLite
- `config` 管配置
- `health` 管健康检查
