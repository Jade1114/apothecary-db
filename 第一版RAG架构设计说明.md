# 第一版 RAG 架构设计说明

## 一、项目定位

本项目第一版的目标是实现一个面向个人长期使用的 AI 个人知识画像系统原型。

核心链路为：

- 资料输入
- 文本切分
- 向量化入库
- 按画像维度检索 evidence
- 基于 Prompt 与大模型生成结构化画像
- 存储与前端展示

这个项目当前阶段不是做大而全的平台，也不是做复杂 Agent 编排系统，而是先完成一条清晰、可运行、可扩展的 RAG 主链路。

---

## 二、第一版目标范围

### 当前第一版要完成的能力

- 支持资料输入类型：
  - text
  - doc
  - chat
- 对资料进行 chunking
- 为 chunk 生成 embedding
- 将 chunk 向量写入向量数据库
- 按画像维度进行向量检索
- 将检索得到的 evidence 与 Prompt 一起交给模型
- 生成结构化个人画像
- 将资料与画像结果存储下来
- 在前端展示画像、依据片段与历史记录

### 当前第一版暂不纳入主线的能力

- 图片输入
- OCR / 多模态理解
- 动态 query 生成
- Agentic RAG
- rerank / 混合检索
- 复杂切分优化
- 多用户系统
- 权限系统
- 长期记忆系统
- 自动更新画像

---

## 三、整体架构总览

第一版整体链路如下：

1. 数据输入
2. 文本预处理
3. 向量化入库
4. 按画像维度检索
5. Prompt + LLM 生成
6. 结构化画像展示与存储

可以压缩为一句话：

> 这是一个以 `SQLite + Qdrant` 为双存储底座、支持 `text/doc/chat` 输入、基于 chunking + embedding + 向量检索 + Prompt + LLM 生成结构化个人知识画像的第一版 RAG 原型。

---

## 四、职责分层

### 1. 输入层

负责：

- 接收用户资料
- 支持不同输入形式
- 统一转成文本

当前支持：

- 文本输入
- 文档导入（txt / md）
- 对话输入（文本方式）

### 2. 检索层

负责：

- chunking
- embedding
- 向量入库
- 向量检索
- evidence 组织

这一层是第一版最核心的 RAG 底座。

### 3. 生成层

负责：

- Prompt 约束
- LLM 调用
- 结构化画像生成

### 4. 展示与存储层

负责：

- 保存原始资料
- 保存最终画像
- 展示画像、依据片段与历史记录

---

## 五、数据库架构

### 1. SQLite 的职责

SQLite 用于存储结构化业务数据，负责：

- 原始资料
- 最终画像
- 历史记录
- 元信息

当前已存表：

- `documents`
- `profiles`

SQLite 不负责语义检索。

### 2. Qdrant 的职责

Qdrant 用于存储 chunk 向量并执行语义检索，负责：

- chunk embedding 向量
- chunk metadata
- 基于相似度召回 evidence

Qdrant 不负责业务历史记录和最终画像结果存储。

### 3. 双存储分工

- `SQLite`：业务数据层
- `Qdrant`：向量检索层

这两者是互补关系，而不是替代关系。

---

## 六、Qdrant 设计

### 1. Collection

第一版建议只建一个 collection：

- `profile_chunks`

原因：

- 所有 chunk 先统一进一个集合
- 不按画像维度拆 collection
- 画像维度由 query 决定，而不是由 collection 决定

### 2. Point 粒度

第一版约定：

- 一条 point = 一个 chunk

不建议第一版直接做句子级全量入库，以免复杂度与噪声处理成本过高。

### 3. Distance Metric

第一版建议：

- `Cosine`

### 4. Point ID

第一版建议使用可读字符串 ID：

```text
{source_type}_{document_id}_chunk_{chunk_index}
```

例如：

- `doc_12_chunk_0`
- `chat_8_chunk_2`

这样便于调试、追踪和后续覆盖更新。

### 5. Payload 设计

第一版 payload 建议如下：

```json
{
  "document_id": 12,
  "source_type": "doc",
  "source_name": "java-notes.md",
  "chunk_index": 3,
  "content": "我最近想把 Java 并发这块真正学扎实。",
  "created_at": "2026-04-04T10:00:00"
}
```

字段说明：

- `document_id`：对应 SQLite 中原始资料主键
- `source_type`：资料来源类型（text / doc / chat）
- `source_name`：来源名称，如文件名或对话名
- `chunk_index`：chunk 顺序号
- `content`：chunk 原文
- `created_at`：入库时间

### 6. 第一版过滤条件

第一版向量检索必须支持按：

- `document_id`

进行过滤，避免不同资料之间的 evidence 串库。

---

## 七、资料入库流程

第一版建议的标准入库流程如下：

1. 将原始资料存入 SQLite
2. 获得 `document_id`
3. 对资料做 chunking
4. 对每个 chunk 生成 embedding
5. 将 chunk + vector + payload 写入 Qdrant
6. 后续所有检索均基于该 `document_id` 进行过滤

### 为什么先存 SQLite 再入向量库

因为：

- `document_id` 是整条链路的主线索
- Qdrant 中每个 chunk 都需要知道自己属于哪份资料
- 后续画像、历史记录、检索过滤都依赖这个主键

---

## 八、检索流程设计

第一版不是普通问答检索，而是：

- 按画像维度检索 evidence

### 当前固定画像维度

- 技术兴趣
- 关注话题
- 表达风格

### 第一版检索流程

1. 选择画像维度
2. 取该维度固定 query
3. 对 query 做 embedding
4. 到 `Qdrant` 检索相似 chunk
5. 加 `document_id` filter
6. 返回 top-k chunk
7. 对结果做轻量 evidence 过滤
8. 将 evidence 交给 Prompt + LLM

### 第一版检索策略

- `filter`：按 `document_id`
- `top-k`：统一先用 `5`
- `query`：固定写死
- `后处理`：轻量去噪 + 保留更像人物证据的内容

### 当前固定 query 方向

#### 技术兴趣

找能体现该用户技术兴趣、技术栈偏好、技术投入方向和持续学习意愿的内容。

#### 关注话题

找能体现该用户持续关注、反复讨论或重点思考的问题域、主题和实践议题的内容。

#### 表达风格

找能体现该用户表达方式、沟通习惯、信息组织方式和语言风格特征的内容。

---

## 九、生成层设计

### 1. Prompt 层

当前 Prompt 已明确：

- 角色
- 任务
- 边界
- 流程
- 输出格式
- 去重约束
- evidence 原句引用要求
- 噪声过滤要求
- 数量控制
- score 分级规则

### 2. 模型层

当前已有可插拔生成层：

- 占位生成器
- 后续替换为真实云模型

第一版目标是：

- 将 evidence + Prompt 交给真实模型
- 输出结构化个人画像

---

## 十、前端当前角色

前端当前职责为：

- 资料输入
- 画像展示
- 依据片段展示
- 历史画像展示

当前已支持：

- 文本输入
- 文档导入
- 对话输入模式
- 规则版气泡画像
- 生成版画像展示
- evidence 展示
- 历史画像展示

前端不承担：

- 核心检索逻辑
- chunking
- embedding
- 画像生成

这些能力全部归后端处理。

---

## 十一、后端模块化方向

后续建议逐步整理为如下结构：

```text
backend/
  main.py
  prompts.py
  llm_service.py
  storage.py
  embedding_service.py
  vector_store.py
  ingest_flow.py
  retrieve_flow.py
```

### 模块职责

- `main.py`：接口入口与主流程编排
- `prompts.py`：Prompt 模板与检索 query 模板
- `llm_service.py`：模型调用层
- `storage.py`：SQLite 读写
- `embedding_service.py`：embedding API 调用层
- `vector_store.py`：Qdrant 操作层
- `ingest_flow.py`：资料入库流程
- `retrieve_flow.py`：按维度检索 evidence 流程

---

## 十二、当前版本与未来扩展边界

### 当前第一版必须完成

- text / doc / chat 输入
- chunking
- embedding
- Qdrant 向量检索
- 固定 query 维度召回
- Prompt + 真实模型生成
- 结果展示与存储

### 当前明确延后

- 图片输入
- OCR / 多模态
- 动态 query
- Agentic RAG
- rerank / 混合检索
- 复杂切分优化
- 画像版本比较
- 高级 evidence 质量评分

---

## 十三、对第一版的总体要求

第一版不追求复杂平台化，而追求：

- 主链路清楚
- 检索逻辑成立
- 画像结果可展示
- evidence 可追溯
- 架构可扩展到未来 agentic RAG

换句话说，第一版的目标不是做到最强，而是做到：

- 可运行
- 可解释
- 可扩展
- 可继续演进
