# 标准化文档格式与 SQLite 持久化设计

## 1. 文档目的

本文档用于明确本项目后续在“文件系统驱动知识库”模式下的两件核心事情：

1. 软件内部的标准化文档格式应该如何定义。
2. SQLite 的持久化表结构应该如何设计，以及这些表各自负责什么、如何连接。

这份文档的核心目标是把三个层次彻底分开：

- 原始文件层
- 标准化文档层
- SQLite 结构化持久化层

避免把 parser 输出、中间格式、数据库结构和向量检索逻辑混在一起。

当前阶段以文档定义目标模型为主。

也就是说：

- 先把对象职责和边界写清楚
- 当前代码实现与重构顺序后续再对齐
- 本文档优先说明“系统应该怎么建模”

---

## 2. 设计结论

### 2.1 `yaml + md` 的定位

后续项目中，`yaml + md` **不是最终数据库格式**，而是软件内部的：

- 标准化文档格式
- parser 统一输出格式
- 后续 chunk / ingest / 重建索引的标准输入
- 可落盘、可调试、可回溯的中间真相层

一句话概括：

> `yaml + md` 是标准化文档层，不是 SQLite 表结构本身。

### 2.2 `yaml + md` 必须落盘

当前已经明确：

- 标准化文档必须落盘
- 当前不优先考虑这层带来的额外存储体积
- 原始文件删除后，标准化文档落盘文件当前选择继续保留，用作后续处理、调试和回溯

原因有三：

1. 方便后续重建 chunk、embedding、向量索引
2. 方便调试 parser 结果和追踪解析问题
3. 方便后续更换向量 provider、chunk 策略或 parser 版本时进行重建与比对

所以后续系统会形成一层稳定的标准化文档资产，而不是每次都从原始文件重新 parse 到数据库。

---

## 3. 三层结构

### 3.1 原始文件层

这一层是用户自己的文件系统内容，例如：

- `txt`
- `md`
- `pdf`
- `docx`
- 未来的图片、视频、音频等

这一层是知识源头，不被软件接管。

### 3.2 标准化文档层

这一层是 parser 的统一输出层。

它把各种不同格式的文件统一转成软件内部标准文档格式。

当前建议采用：

- `yaml frontmatter`
- `markdown body`

作为逻辑表达形式，并要求这层结果必须落盘。

### 3.3 SQLite 结构化持久化层

这一层不直接等于 `yaml + md`，而是将标准化文档进一步拆解为结构化记录，用于：

- 查询
- 同步
- 删除
- 重建索引
- chunk 管理
- 向量映射
- 后续画像与问答历史

---

## 4. 标准化文档层设计

### 4.1 定位

标准化文档层用于解决下面这个问题：

> 不同类型的原始文件，如何在进入 ingest 和索引体系之前，被统一成软件内部可理解、可处理、可回溯的一种格式？

后续流程应当是：

```text
原始文件
→ parser
→ 标准化文档（yaml + md）
→ SQLite 持久化
→ chunk
→ embedding
→ vector store
```

### 4.2 标准化文档的作用

它主要负责：

- 统一 parser 输出
- 作为后续 ingest 的标准输入
- 作为 chunk 重建的基础材料
- 作为调试与回溯的中间真相层

它不负责：

- 替代 SQLite 表结构
- 直接承担所有查询需求
- 直接替代 chunk 和向量层结构

### 4.3 建议的逻辑结构

标准化文档的逻辑概念可以命名为：

- `NormalizedDocument`

它的表达形式采用：

- YAML：结构化元数据
- Markdown：正文文本

例如：

```md
---
file_id: "file_001"
source_path: "notes/backend/nestjs.md"
source_type: "md"
source_name: "nestjs.md"
title: "NestJS 笔记"
metadata:
  extension: "md"
  hash: "abc123"
  parser: "markdown-parser"
  parser_version: "v1"
---

# NestJS 笔记

这里是标准化后的正文文本。
```

### 4.4 是否必须把标准化文档整块写进数据库

不必须。

当前设计判断是：

- 标准化文档必须落盘
- SQLite 中需要为结构化查询和索引另行建表
- 标准化文档可以在 `documents.normalized_path` 中记录其落盘位置

这让系统既保留标准化中间真相层，也保留结构化查询能力。

补充说明：

- 在线可见性不由“文件是否还保留着标准化文档落盘文件”决定
- 在线可见性仍由 `files`、`documents`、`chunks`、`chunk_vectors` 和向量层共同决定

---

## 5. SQLite 持久化设计原则

SQLite 表结构不应围绕“文档长什么样”直接设计，而应围绕系统行为设计。

后续表结构主要服务于三类问题：

1. 文件身份与变化跟踪
2. 标准化文档与结构化内容记录
3. 检索、向量索引与后续衍生能力

因此，数据库结构必须独立设计，不能简单把一整段 `yaml + md` 直接塞进一个字段就结束。

### 5.1 当前阶段的 5 + 1 边界

按当前阶段的实现目标，可以先把模型收敛成下面这套边界：

#### 5 张内容表 / 内容层对象

1. `files`
   原始文件登记表，保存文件身份与删除事实。
2. `documents`
   标准化文档主表，保存 parser 产物的当前结构化记录。
3. `chunks`
   文档切分后的检索块。
4. `vectors`
   向量数据库本身，例如 `sqlite-vec` 的虚拟表。
   它不是标准关系表，更像之前使用的 Qdrant。
5. `chunk_vectors`
   `chunks` 与向量点之间的映射层。

#### 1 张过程表 / 运行层对象

6. `sync_jobs`
   同步过程记录表，用来回答：
   - 现在在做哪一步同步
   - 上一次失败发生在哪一步
   - 当前状态是怎么变成现在这样的

一句话概括：

- `files / documents / chunks / vectors / chunk_vectors` 负责保存“系统里有什么”
- `sync_jobs` 负责记录“系统是怎么变成这样的”

这套 `5 + 1` 是当前文档层面锁定的目标边界。

至于具体先重构哪一部分，后续再单独决定。

---

## 6. 推荐核心表结构

当前阶段建议优先围绕“5 张内容表 + 1 张过程表”收敛。

其中：

- `files / documents / chunks / chunk_vectors` 落在 SQLite 关系层
- `vectors` 落在 sqlite-vec 虚拟表或其他向量存储中
- `sync_jobs` 落在 SQLite 关系层，用于记录同步过程

下文仍会保留 `profiles`、`rag_queries` 等后续扩展表，作为中后期扩展方向。

---

## 6.1 `files`

### 作用

这是原始文件登记表，负责回答：

- 这个文件是谁
- 它当前路径是什么
- 内容是否变化过
- 当前是否还存在
- 后续同步时它应该如何处理

### 建议结构

```sql
CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    extension TEXT NOT NULL,
    kind TEXT NOT NULL,
    size INTEGER,
    hash TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    last_normalized_path TEXT,
    normalized_retained_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME,
    deleted_at DATETIME
);
```

### 字段说明

- `id`：文件内部主键
- `path`：当前路径
- `name`：文件名
- `extension`：后缀名
- `kind`：大类，例如 `text` / `document` / `image` / `video`
- `size`：文件大小
- `hash`：内容指纹
- `status`：例如 `active / deleted / ignored / error`
- `last_normalized_path`：最近一次标准化文档落盘路径；即使在线 `documents` 被清理，也可以用于追踪软保留资产
- `normalized_retained_at`：原始文件删除后，标准化文档落盘文件作为保留资产被确认保留的时间
- `last_seen_at`：最近一次扫描时见到该文件的时间
- `deleted_at`：软删除时间

### 连接关系

- `documents.file_id -> files.id`
- `sync_jobs.file_id -> files.id`

---

## 6.2 `documents`

### 作用

这是标准化文档主表，表示：

- 某个原始文件被 parse 后，在系统里形成的一份标准文档记录

### 建议结构

```sql
CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    source_name TEXT,
    title TEXT,
    plain_text TEXT NOT NULL,
    normalized_path TEXT,
    parser_name TEXT,
    parser_version TEXT,
    parse_status TEXT NOT NULL DEFAULT 'ready',
    index_status TEXT NOT NULL DEFAULT 'failed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id)
);
```

### 字段说明

- `file_id`：对应原始文件
- `source_type`：例如 `txt / md / pdf / docx`
- `source_name`：来源名
- `title`：提取出的标题
- `plain_text`：全文线性文本
- `normalized_path`：标准化文档落盘路径，也可以指向后续保留的归档/软保留文件
- `parser_name`：解析器名称
- `parser_version`：解析器版本
- `parse_status`：标准化文档当前状态，例如 `ready / stale / failed`
- `index_status`：检索索引当前状态，例如 `ready / stale / failed`

补充说明：

- `pending / parsing / indexing` 更适合作为任务或事件语义，不建议长期塞在 `documents` 当前状态字段里
- `deleted` 只保留在 `files` 层；如果对应文件删除，推荐直接清理在线 `documents` 及其下游记录，而不是在 `documents` 中长期保留 `deleted`
- 标准化文档落盘文件当前选择保留，不直接参与在线可见性判断

### 连接关系

- `documents.file_id -> files.id`
- `document_blocks.document_id -> documents.id`
- `chunks.document_id -> documents.id`
- `profiles.scope_type=document, profiles.scope_id=documents.id`（后续扩展）

---

## 6.3 `document_blocks`

### 作用

这是标准化文档块表，用来保存标准化文档里的结构块。

它当前属于可选扩展层，不在“5 张内容表 + 1 张过程表”的最小核心边界内。

注意：

- `document_blocks` 是文档结构单元
- 它不是最终检索 chunk

### 建议结构

```sql
CREATE TABLE document_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    block_index INTEGER NOT NULL,
    block_type TEXT NOT NULL,
    text TEXT NOT NULL,
    page INTEGER,
    heading_path TEXT,
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id),
    UNIQUE(document_id, block_index)
);
```

### 字段说明

- `block_index`：块在文档中的顺序
- `block_type`：例如 `heading / paragraph / quote / list / code / table`
- `text`：块内容
- `page`：页码（适用于 pdf/docx 等）
- `heading_path`：标题路径，例如 `后端/RAG/下一步`
- `metadata_json`：额外结构信息

### 连接关系

- `document_blocks.document_id -> documents.id`

---

## 6.4 `chunks`

### 作用

这是检索块表，保存真正送入 embedding 和向量检索体系的 chunk。

注意：

- `blocks` 是结构块
- `chunks` 是检索块
- 两者不要混淆

一个 chunk 可能对应多个相邻 block 的组合。

### 建议结构

```sql
CREATE TABLE chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    token_count INTEGER,
    source_block_start INTEGER,
    source_block_end INTEGER,
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id),
    UNIQUE(document_id, chunk_index)
);
```

### 字段说明

- `chunk_index`：当前文档下的第几个 chunk
- `text`：chunk 内容
- `token_count`：token 数量
- `source_block_start`：起始 block index
- `source_block_end`：结束 block index
- `metadata_json`：页码、标题路径等派生信息

### 连接关系

- `chunks.document_id -> documents.id`
- `chunk_vectors.chunk_id -> chunks.id`

---

## 6.5 `chunk_vectors`

### 作用

这是 chunk 与向量层的映射表，负责回答：

- 哪个 chunk 对应哪个向量索引
- 当前使用的 provider 是什么
- 维度是什么

### 建议结构

```sql
CREATE TABLE chunk_vectors (
    chunk_id INTEGER PRIMARY KEY,
    vector_id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    dimension INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chunk_id) REFERENCES chunks(id)
);
```

### 字段说明

- `chunk_id`：对应哪个 chunk
- `vector_id`：向量层内部 ID
- `provider`：例如 `qdrant / sqlite-vec`
- `dimension`：向量维度

补充说明：

- 向量层的当前可用性，推荐收敛到 `documents.index_status`
- `chunk_vectors` 主要保存 chunk 与向量点的映射关系，不承担完整状态机职责
- `deleted` 不建议长期保留在 `chunk_vectors` 里；文件删除时直接清理相关 chunk、映射和向量点

### 连接关系

- `chunk_vectors.chunk_id -> chunks.id`

---

## 6.6 `profiles`

### 作用

`profiles` 后续仍然有价值，但其定位不再局限于“单文档附属表”，而更适合作为系统中的衍生认知层。

它后续可以表达：

- 文档级摘要
- 目录级总结
- 项目级画像
- 主题级画像
- 个人级长期知识画像

### 推荐方向

后续 `profiles` 建议按更通用的结构设计，例如：

```sql
CREATE TABLE profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_type TEXT NOT NULL,
    scope_id INTEGER NOT NULL,
    profile_type TEXT NOT NULL,
    title TEXT,
    summary TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    source_snapshot TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 字段说明

- `scope_type`：例如 `document / folder / project / topic / vault`
- `scope_id`：对应对象 ID
- `profile_type`：例如 `summary / project-profile / knowledge-profile`
- `summary`：简短总结
- `profile_json`：详细结构化结果
- `source_snapshot`：生成时依赖的数据快照信息

### 当前阶段建议

- 保留 `profiles` 概念
- 但不作为第一阶段主线
- 后续等文件系统主链路稳定后再扩展

---

## 6.7 `rag_queries`

### 作用

保存问答历史，用于：

- 回看问答记录
- 分析常见问题
- 后续优化检索和答案质量

### 建议结构

```sql
CREATE TABLE rag_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    answer TEXT,
    evidence_json TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 说明

第一阶段不是必须，但中后期会很有用。

---

## 6.8 `sync_jobs`

### 作用

这是同步任务表，用于记录文件系统驱动阶段的同步过程：

- 扫描任务
- 解析任务
- 建索引任务
- 删除回收任务
- 失败与重试状态
- 文件同步过程中的操作记录

### 建议结构

```sql
CREATE TABLE sync_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id)
);
```

### 说明

推荐最小语义：

- `job_type`：例如 `scan / parse / index / delete`
- `status`：例如 `pending / running / succeeded / failed`

这张表更适合回答：

- 本次同步在做什么
- 最近一次失败发生在什么阶段
- 为什么当前状态会变成现在这样

也就是说：

- 主表状态回答“现在是什么状态”
- `sync_jobs` 回答“它是怎么变成现在这样的”

`sync_jobs` 的职责边界建议明确成下面这样：

- 它记录一次同步尝试，而不是保存业务内容
- 它记录 `scan / parse / index / delete` 过程及结果
- 它提供失败原因、重试线索和运行状态
- 它不替代 `files`、`documents` 的当前状态字段
- 它不保存标准化正文、chunk 正文或向量内容

---

## 7. 表关系概览

推荐的关系如下：

```text
files
  └── documents
        ├── chunks
        │     └── chunk_vectors
        │            └── vectors（sqlite-vec / vector store）
        ├── document_blocks（可选扩展）
        └── profiles（document scope，可选扩展）

rag_queries
sync_jobs
```

从职责上理解：

- `files`：文件身份层
- `documents`：标准文档主记录层
- `chunks`：检索块层
- `vectors`：向量存储层
- `chunk_vectors`：向量映射层
- `document_blocks`：结构块层（可选扩展）
- `profiles`：衍生认知层
- `rag_queries`：问答历史层
- `sync_jobs`：同步任务层

---

## 8. 当前阶段的建模边界

为了避免文档和实现顺序互相绑死，当前先锁定建模边界，不在这里提前锁定重构顺序。

当前核心内容层统一按下面 5 张表理解：

- `files`
- `documents`
- `chunks`
- `vectors`
- `chunk_vectors`

此外，过程层使用：

- `sync_jobs`

可选扩展层包括：

- `document_blocks`
- `profiles`
- `rag_queries`

这套边界已经足够支撑：

- 文件识别
- 文件标准化
- SQLite 持久化
- chunk 构造
- 向量索引
- 后续重建与 provider 替换

具体先重构哪一块，后续再按工程节奏拆分。

---

## 9. 当前阶段的执行含义

基于当前设计判断，后续系统不再以“手动文本输入”为主入口，而是以：

- 文件识别
- 文件解析
- 标准化文档生成
- 标准化文档入库

作为当前阶段主线。

也就是说，后续主流程应演进为：

```text
文件选择 / 文件扫描
→ parser
→ 生成并落盘标准化文档（yaml + md）
→ 持久化到 SQLite
→ 如有需要构建 document_blocks
→ 构建 chunks
→ embedding
→ vector store
→ rag query
```

---

## 10. 结论

当前阶段已经明确以下设计原则：

1. `yaml + md` 是软件内部标准化文档格式，不是 SQLite 终态结构。
2. 标准化文档必须落盘，作为可调试、可回溯、可重建的中间真相层。
3. SQLite 表结构必须独立设计，用于承接文件身份、文档结构、检索块和向量索引。
4. 当前核心边界按 `files / documents / chunks / vectors / chunk_vectors + sync_jobs` 收敛。
5. 标准化文档落盘文件当前选择保留，不直接决定在线可见性。
6. `sync_jobs` 是过程层，不是第 6 张内容表。
7. `profiles` 方向仍有价值，但后续应升级为更通用的衍生认知层，而不是停留在当前 demo 阶段的单文档附表形态。

这套设计是后续从“文本 ingest demo”过渡到“文件系统驱动的个人知识引擎”的关键基础。
