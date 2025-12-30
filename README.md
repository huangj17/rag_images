# RAG 图文混合文档处理系统

基于 **FastAPI + React Router 7** 的端到端解决方案，支持 **图文混合文档解析 → 向量入库 → 搜索 → 流式对话**，并在结果中展示对应图片，提升多模态可读性。

## 核心特性（优化点）

- **智能多层次切片**：标题优先 → 段落切分 → 超长强制切分；支持 `max_chunk_size / min_chunk_size / chunk_overlap`
- **增强标题识别**：支持中文标题模式（如“一、/1./第一章/(1)”）
- **图片原位置插入**：解析时在文本中插入 `[IMG:图片路径]` 占位符；若无法定位则均匀分配到各 chunk
- **检索/对话性能优化**：问候语快速响应；高置信度检索（阈值 0.75）跳过 LLM 评估；问题重写最多 1 次
- **多知识库（多 collection）**：SQLite 管理知识库元数据，前端可选择知识库进行入库/检索/对话
- **图片访问 API**：前端通过 `/api/images/{image_path}` 拉取图片并渲染

## 仓库结构

- `backend/`：FastAPI 服务，负责解析、索引、检索、聊天，连接 Milvus；详细见 `backend/README.md`
- `frontend/`：React Router 7 前端，提供知识库管理、文档上传解析、检索与对话界面
- `docs/`：流程与方案说明

## 快速开始

### 环境准备

- **Milvus**：用于向量检索（后端会在启动时尽力初始化连接）
- **Ollama / 兼容 OpenAI 接口的服务**：用于 embedding 与 LLM（通过 `EMBEDDING_BASE_URL`、`LLM_BASE_URL` 配置）
- **Node.js ≥ 20**：用于前端

### 1. 配置后端环境变量

**⚠️ 首次运行前必须配置**

```bash
cd backend
cp .env.example .env
# 编辑 .env 文件，填写真实的 OLLAMA_API_KEY 和其他配置
```

> **安全提示**：切勿将 API Key 硬编码到代码中，`.env` 文件已在 `.gitignore` 中排除。

### 2. 启动后端

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```

如需更多 API、参数与排障说明，请阅读 `backend/README.md`。

### 3. 启动前端

```bash
cd frontend
pnpm install
pnpm dev   # 默认 http://localhost:5173，对接后端 http://localhost:8010
```

若后端地址变化，修改 `frontend/app/lib/api.ts` 中的 `API_BASE_URL` 后再运行。

## 配置要点

- **Milvus**：`MILVUS_HOST`、`MILVUS_PORT`、`MILVUS_DB_NAME`、`MILVUS_COLLECTION_NAME`
- **Embedding**：`EMBEDDING_MODEL`、`EMBEDDING_BASE_URL`
- **LLM（可选但推荐）**：`LLM_MODEL`、`LLM_BASE_URL`、`LLM_TEMPERATURE`、`OLLAMA_API_KEY`
- **切片默认参数**：`DEFAULT_MAX_CHUNK_SIZE`、`DEFAULT_MIN_CHUNK_SIZE`、`DEFAULT_CHUNK_OVERLAP`
- 前端编译时固定后端地址，请在构建或打包前调整

## 常用入口

- Swagger: `http://localhost:8010/docs`
- ReDoc: `http://localhost:8010/redoc`
- 前端开发: `http://localhost:5173`

更多设计细节可参考：

- `backend/RAG_优化策略说明.md`（切片/图片优化策略）
- `docs/RAG问答流程说明.md`（RAG 问答流程）
- `docs/知识库管理_前端.md`、`docs/知识库管理_后端.md`（知识库管理）
