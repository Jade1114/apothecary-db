# 本地知识库同步状态机设计

## 1. 文档目的

本文档用于整理“原始文件变化后，标准化文档与检索索引如何同步”的状态机设计。

当前阶段以文档定义目标语义为主。

也就是说：

- 先把状态机和职责边界写清楚
- 当前代码实现、状态命名和重构顺序后续再对齐
- 本文档优先回答“目标系统应该怎么表达”，而不是“当前代码已经做到什么程度”

这份设计重点回答四个问题：

1. 原始文件变化后，标准化文档应该如何处理。
2. 标准化文档状态与索引状态应如何定义。
3. 哪些状态适合长期持久化，哪些更适合作为任务或事件语义。
4. 当前阶段如何优先把检索链路（R）做稳，而不是先展开生成链路（G）。

本文档只讨论同步规则、状态语义与落库建议，不讨论 UI 细节，也不展开完整任务系统实现。

---

## 2. 设计结论

### 2.1 原始文件是唯一真相源

在这套系统里，原始文件始终是唯一真相源。

这意味着：

- 用户维护的是原始文件。
- 标准化文档不是手工编辑资产，而是 parser 产物。
- 原始文件一旦发生变化，已有标准化文档和索引就应被视为旧版本。
- 系统不应要求用户手工同步标准化文档内容。

一句话概括：

> 原始文件变化后，应重新生成标准化文档并重建索引，而不是人工修改派生产物。

### 2.2 当前阶段先把 Retrieval 做稳

当前阶段先聚焦 RAG 中的 `R`：

- 文件扫描
- 标准化文档生成
- chunk / embedding / vector index
- 删除同步与索引一致性

生成链路（`G`）后续再优化，本状态机不以生成阶段为中心展开。

### 2.3 状态机拆成三层

推荐拆成三层语义：

1. 文件状态机
2. 标准化文档状态机
3. 索引状态机

原因很直接：

- 文件是否存在，不等于 parser 是否成功。
- parser 是否成功，不等于索引是否可检索。
- 如果把这三件事混在一个状态里，后续排错、重试、展示、调度都会变得混乱。

### 2.4 `deleted` 只保留在文件层

这是本轮明确锁定的规则：

- `deleted` 只在 `files` 层保留。
- 一旦确认文件删除，在线 `documents` 记录、chunks、chunk_vectors、向量点都直接清理。
- 标准化文档落盘文件当前选择继续保留，作为后续处理、调试与回溯资产。
- `files.last_normalized_path` 可以记录最近一次标准化文档落盘路径，用来在在线 `documents` 被清理后继续追踪该软保留资产。
- `documents` 和索引层不长期保留 `deleted` 状态。

也就是说：

> `files.status = deleted` 是删除事实；下游不是进入长期 deleted 状态，而是被清理掉。

### 2.5 任务态与当前状态不必完全混成一个字段

当前阶段不要求把“持久状态机”和“非持久状态机”完全拆成两套系统，但语义上应明确：

- `active / deleted / error / ignored`
- `ready / stale / failed`

更适合作为“当前事实”。

而下面这些更适合作为任务或事件语义：

- `new / changed / missing`
- `pending / parsing / indexing`

原因是这些状态变化很快，后续又会接入异步处理，继续强行把它们都做成长期状态字段，容易增加歧义。

---

## 3. 总体同步原则

### 3.1 单向派生

推荐采用下面这条单向链路：

```text
原始文件
→ 标准化文档
→ chunks
→ embeddings
→ vector index
```

也就是说：

- 上游变化向下游传播
- 下游状态不能反向修改上游语义

### 3.2 过期后重建，而不是就地修补

原始文件变化时，系统不应尝试“局部修补旧标准化文档”。

推荐动作是：

1. 将现有标准化文档标记为过期
2. 将现有索引标记为过期
3. 重新进入待处理队列
4. 重新解析原始文件
5. 重新生成标准化文档
6. 重新建立 chunk 与索引

处理原则应当是：

> 过期后重建，而不是在旧产物上打补丁。

### 3.3 删除必须向下游传播

如果原始文件被确认删除，那么对应在线数据的：

- 标准化文档
- chunks
- 向量索引
- 相关映射记录

都应当被清理，而不是继续留在系统里参与检索。

但标准化文档落盘文件当前选择保留。

也就是说，删除语义区分两件事：

- 在线检索数据需要清理
- 落盘的标准化文档资产可以继续保留
- `files` 层需要保留足够的路径信息，让系统后续还能找到这份标准化资产

否则就会出现：

- 文件已经没了
- 但检索仍然在召回它

这是当前阶段必须避免的脏数据问题。

### 3.4 允许旧版本以 `stale` 语义暂时保留

当前阶段为了先把检索链路做稳，系统可以允许旧版本的标准化文档或索引暂时保留。

推荐原则是：

- 文件未删除时，旧版本可以以 `stale` 语义存在，供重建失败时回退
- 文件一旦删除，下游所有派生产物直接清理

这能兼顾两件事：

- 删除后不再召回脏数据
- 重建失败时不至于把检索能力打空

---

## 4. 文件状态机

### 4.1 作用

文件状态机用于描述原始文件本体当前处于什么状态。

这一层主要回答：

- 文件是否仍然存在
- 文件最近一次同步是否成功
- 文件是否应被系统纳管

### 4.2 推荐长期状态

推荐当前阶段长期保留下面这些状态：

- `active`：文件存在，且当前同步结果可接受
- `deleted`：文件已确认删除
- `error`：最近一次同步失败
- `ignored`：存在但当前策略不处理

### 4.3 推荐事件/调度语义

下面这些语义仍然有价值，但更适合作为扫描事件或调度语义，而不是长期持久化状态：

- `new`：首次发现
- `changed`：内容已变化，需要重建
- `missing`：本轮扫描未发现，等待确认删除

这些语义可以体现在：

- `sync_jobs`
- 事件日志
- 调度队列
- 内存中的 reconcile 流程

### 4.4 推荐转移

```text
file.discovered(new)       -> 入同步链路
首次处理成功               -> active
file.changed               -> 入重建链路
重建成功                   -> active
file.missing               -> 等待确认删除
确认删除                   -> deleted
最近一次处理失败           -> error
error 重试成功             -> active
策略忽略                   -> ignored
```

### 4.5 说明

文件层只表达“文件本体事实”。

它不直接表达：

- 标准化文档是否已是最新版本
- 索引是否已完成

这些交给下游状态机处理。

---

## 5. 标准化文档状态机

### 5.1 作用

标准化文档状态机用于描述 parser 产物的当前状态。

这一层主要回答：

- 是否已有可用的标准化文档
- 当前保留的标准化文档是否对应最新文件版本
- 最近一次标准化文档生成是否成功

### 5.2 推荐长期状态

推荐长期保留下面这些状态：

- `ready`：标准化文档已生成，且对应当前原始文件版本
- `stale`：旧版本标准化文档仍保留，但已经落后于当前原始文件版本
- `failed`：当前没有可用标准化文档，且最近一次生成失败

### 5.3 推荐任务语义

下面这些语义保留，但更适合作为任务或事件状态：

- `pending`：已确认需要生成或重建，但尚未开始
- `parsing`：正在解析原始文件并生成标准化文档

### 5.4 核心主链路

概念上的主链路仍然是：

```text
ready -> stale -> pending -> parsing -> ready
```

但需要明确：

- `ready -> stale` 是当前状态变化
- `pending` 与 `parsing` 更偏任务阶段
- 最终持久化时，当前状态更应落在 `ready / stale / failed`

### 5.5 失败规则

标准化文档层的失败需要区分两种情况：

1. 有旧版本可回退
2. 没有旧版本可回退

推荐规则：

- 如果旧版本标准化文档仍然存在且可用，新的 parse 失败后，当前状态保持 `stale`
- 如果系统已经没有可用标准化文档，且本次 parse 失败，则进入 `failed`
- 最近一次 parse 失败的详情应写入任务层，而不是只靠状态字段表达

### 5.6 删除规则

标准化文档层不长期保留 `deleted` 状态。

当检测到：

- `files.status = deleted`

时，系统应直接：

- 删除或移出在线 `documents` 记录
- 保留标准化文档落盘文件，作为软保留资产

也就是说，这里的删除语义是“在线数据清理”，不是“长期停留在 deleted”。

---

## 6. 索引状态机

### 6.1 作用

索引状态机用于描述 chunk、embedding、vector index 是否已经完成并可用于检索。

这一层主要回答：

- 当前是否存在可用索引
- 当前索引是否对应最新文件版本
- 最近一次建索引是否成功

### 6.2 推荐长期状态

推荐长期保留下面这些状态：

- `ready`：索引完成，且对应当前原始文件版本
- `stale`：旧索引仍保留，但已经落后于当前原始文件版本
- `failed`：当前没有可用索引，且最近一次建索引失败

### 6.3 推荐任务语义

下面这些语义保留，但更适合作为任务或事件阶段：

- `pending`：等待切块或重建索引
- `indexing`：正在切块、embedding、写入向量索引

### 6.4 核心主链路

概念上的主链路仍然是：

```text
ready -> stale -> pending -> indexing -> ready
```

这里同样需要明确：

- `ready -> stale` 是当前状态变化
- `pending` 与 `indexing` 更偏任务阶段
- 当前事实更应落在 `ready / stale / failed`

### 6.5 失败规则

索引层的失败也需要区分是否还有旧索引可用。

推荐规则：

- 如果旧索引仍可用，而新的索引构建失败，则当前状态保持 `stale`
- 如果系统已经没有可用索引，且本次建索引失败，则进入 `failed`
- 最近一次索引失败的详情应写入任务层

### 6.6 删除规则

索引层不长期保留 `deleted` 状态。

当检测到：

- `files.status = deleted`

时，系统应直接：

- 删除对应 `chunks`
- 删除对应 `chunk_vectors`
- 删除向量存储中的点

### 6.7 与检索可见性的关系

当前阶段先把 `R` 做稳，因此推荐语义如下：

- `ready`：可直接参与检索
- `stale`：可作为回退版本暂时保留
- `failed`：不可参与检索

是否允许 `stale` 版本继续对外服务，可以由后续调度或 UI 策略再细化，但语义上应允许它作为回退版本存在。

---

## 7. 三层状态联动规则

### 7.1 新文件进入系统

推荐链路：

```text
file.discovered(new)
-> parse job enqueued
-> parse started
-> normalized ready
-> index job enqueued
-> index ready
-> files.status = active
```

如果首次处理失败：

- `files.status = error`
- `documents.parse_status` 或 `documents.index_status` 进入 `failed`
- 失败详情写入 `sync_jobs`

### 7.2 原始文件内容变化

推荐链路：

```text
file.changed
-> normalized ready -> stale
-> index ready -> stale
-> parse / index jobs 再次进入队列
-> 新版本成功后回到 ready
-> files.status = active
```

### 7.3 标准化文档解析失败

推荐规则：

- 如果旧版本标准化文档仍可保留，则 `parse_status = stale`
- 如果没有可用标准化文档，则 `parse_status = failed`
- `files.status` 可以进入 `error`
- 失败原因由 `sync_jobs` 记录

### 7.4 索引失败

推荐规则：

- 如果旧索引仍可保留，则 `index_status = stale`
- 如果没有可用索引，则 `index_status = failed`
- `files.status` 可以进入 `error`
- 失败原因由 `sync_jobs` 记录

### 7.5 原始文件删除

推荐规则：

```text
files.status -> deleted
```

然后系统执行下游清理：

- 删除 `documents`
- 删除 `chunks`
- 删除 `chunk_vectors`
- 删除向量存储中的记录
- 保留标准化文档落盘文件，用作后续处理、调试或回溯

这里不要求 `documents` 或索引层长期保留 `deleted` 状态。

---

## 8. 事件驱动视角

后续实现时，建议按事件驱动状态变化，而不是在一个函数里硬编码所有分支。

推荐事件示例：

- `file.discovered`
- `file.changed`
- `file.missing`
- `file.deleted`
- `normalized.enqueued`
- `normalized.parsing_started`
- `normalized.generated`
- `normalized.failed`
- `index.enqueued`
- `index.started`
- `index.completed`
- `index.failed`

这样做的好处是：

- 状态转移更清晰
- 后续接入任务队列更自然
- UI / 日志 / 重试策略更容易复用同一套事件语义

---

## 9. 落库建议

### 9.1 当前阶段建议持久化的“当前事实”

当前阶段推荐至少持久化下面这些字段：

- `files.status`
- `files.deleted_at`
- `files.last_normalized_path`
- `files.normalized_retained_at`
- `documents.parse_status`
- `documents.index_status`

其中推荐语义为：

- `files.status`: `active / deleted / error / ignored`
- `documents.parse_status`: `ready / stale / failed`
- `documents.index_status`: `ready / stale / failed`

说明：

- 这里的 `documents.parse_status` 表达的是“标准化文档当前状态”
- 如果后续希望字段名更直观，也可以将其重命名为 `normalized_status`

### 9.2 当前阶段建议持久化的任务层

如果要保留同步过程与失败原因，推荐新增或保留最小 `sync_jobs`：

- `job_type`: `scan / parse / index / delete`
- `status`: `pending / running / succeeded / failed`
- `error_message`

也就是说：

- 状态字段回答“现在是什么状态”
- `sync_jobs` 回答“它是怎么变成现在这样的”

这里的关键边界是：

- `sync_jobs` 记录同步过程
- `sync_jobs` 不替代 `files` 或 `documents` 的当前事实
- `sync_jobs` 不负责保存标准化内容、chunk 内容或向量内容

### 9.3 不必强行长期持久化的状态

下面这些语义当前阶段仍然重要，但不要求长期保留在业务主表中：

- `new / changed / missing`
- `pending / parsing / indexing`

它们更适合出现在：

- 扫描流程
- 调度过程
- 任务记录
- 事件日志

---

## 10. 当前阶段的推荐结论

当前阶段推荐先采用下面这套结论：

这套结论当前以文档为主，用来锁定目标语义；具体重构顺序后续再决定。

### 10.1 文件层

长期状态使用：

- `active`
- `deleted`
- `error`
- `ignored`

`new / changed / missing` 作为扫描或调度语义保留，不要求长期持久化。

### 10.2 标准化文档层

长期状态使用：

- `ready`
- `stale`
- `failed`

`pending / parsing` 作为任务阶段保留，不要求长期持久化。

### 10.3 索引层

长期状态使用：

- `ready`
- `stale`
- `failed`

`pending / indexing` 作为任务阶段保留，不要求长期持久化。

### 10.4 删除语义

删除只保留在 `files` 层：

- `files.status = deleted`

下游标准化文档和索引一旦检测到对应文件已删除，应直接清理，不长期保留 `deleted` 状态。

但标准化文档落盘文件当前选择保留，作为软保留资产。

### 10.5 当前工作重点

当前阶段先把检索链路做稳：

- 扫描
- 标准化文档生成
- chunk / embedding / index
- 删除同步
- 检索一致性

生成链路（`G`）后续再优化。

---

## 11. 一句话总结

这套同步状态机的核心不是“一个状态管全部”，而是：

- 文件状态机描述原始文件有没有活着
- 标准化文档状态机描述 parser 产物是不是最新
- 索引状态机描述当前检索层能不能稳定工作

其中当前阶段最重要的落点是：

- `deleted` 只保留在 `files`
- `ready / stale / failed` 表达当前事实
- `new / changed / missing / pending / parsing / indexing` 更适合作为任务与事件语义
- 先把 Retrieval 做稳，再继续展开 Generation
