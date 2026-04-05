# AI 个人知识画像助手

一个面向个人长期使用的第一版 RAG 原型项目。

它的目标不是做一个大而全的平台，而是围绕一条清晰主链路工作：

- 沉淀资料
- 向量化入库
- 按画像维度检索 evidence
- 基于 Prompt 与大模型生成结构化个人画像
- 在前端查看当前画像

## 当前阶段已经完成什么

当前版本已经具备以下能力：

- 支持通过前端输入资料内容
- 支持将资料写入知识库（`SQLite + Qdrant`）
- 对资料进行 chunking、embedding、向量入库
- 按画像维度检索 evidence：
  - 技术兴趣
  - 关注话题
  - 表达风格
- 接入真实模型生成结构化画像
- 保存已生成画像，并支持读取当前主画像
- 前端以“当前画像工作台”的方式展示结果

## 当前产品流

当前版本的核心使用方式是：

1. 输入资料
2. 点击“资料入库”
3. 系统将资料写入 `SQLite + Qdrant`
4. 点击“重新生成画像”
5. 系统基于已入库资料进行检索并生成当前画像
6. 首页优先展示最近一次已保存画像

也就是说，当前系统已经把“资料入库”和“画像生成”拆成了两个动作。

## 项目结构

### 后端

后端位于 `backend/`，当前主要模块包括：

- `backend/main.py`
  - FastAPI 接口入口
- `backend/storage.py`
  - `SQLite` 读写（documents / profiles）
- `backend/embedding_service.py`
  - embedding API 调用层
- `backend/vector_store.py`
  - `Qdrant` 交互层
- `backend/ingest_flow.py`
  - 资料入库流程（存储、chunking、embedding、向量入库）
- `backend/retrieve_flow.py`
  - 按维度检索 evidence 的流程
- `backend/llm_service.py`
  - 模型生成层（当前支持真实模型 + fallback）
- `backend/prompts.py`
  - 画像生成 Prompt
- `backend/env_loader.py`
  - 项目级 `.env` 加载器

### 前端

前端位于 `frontend/`，当前定位为“当前画像工作台”，主要负责：

- 文本资料输入
- 资料入库操作
- 手动重新生成画像
- 展示当前画像
- 展示 retrieval evidence

## 接口说明

当前关键接口如下：

- `POST /ingest`
  - 仅负责资料入库，不直接生成画像
- `POST /profile/generate`
  - 基于已入库资料重新生成当前画像
- `GET /profile/current`
  - 读取最近一次已保存画像
- `GET /documents`
  - 查看已保存资料
- `GET /profiles`
  - 查看已保存画像列表

> 兼容接口：当前仍保留 `POST /profile`，但推荐以后优先使用上面的拆分接口语义。

## 技术栈

### 后端

- Python
- FastAPI
- SQLite
- Qdrant
- OpenAI-compatible SDK

### 前端

- React
- Vite

## 本地运行

### 1. 启动 Qdrant

确保本地已启动 Qdrant，例如默认地址：

- `http://localhost:6333`

### 2. 配置环境变量

后端使用项目级配置文件：

- `backend/.env`

请在该文件中按需填写以下配置（不要提交真实密钥）：

- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL`
- `EMBEDDING_BASE_URL`
- `QDRANT_URL`
- `QDRANT_VECTOR_SIZE`
- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`

### 3. 启动后端

```bash
cd backend
uv run uvicorn main:app --reload
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

## 当前边界

当前版本仍然是第一版原型，明确还没有重点展开这些内容：

- 图片输入与 OCR
- 多模态理解
- 历史画像详情与版本对比
- 自动增量更新画像
- Agentic RAG
- 动态 query 生成
- rerank / 混合检索
- 对外画像服务 API

## 下一阶段方向

当前更值得继续优化的方向包括：

- evidence 质量与维度边界
- 当前主画像策略
- 附件解析链路（txt / md / doc / chat-export json）
- 对外画像读取 API
- 长期资料沉淀后的画像更新策略

## 项目定位总结

这个项目当前最适合作为：

- 一个第一版 RAG 个人画像原型
- 一个“资料沉淀 + 按需生成画像”的 AI 应用雏形
- 一个后续可扩展到 Agentic RAG 的基础底座
