# RAG 图文混合文档处理系统

基于 FastAPI + React Router 的端到端解决方案，支持文档解析（含图片切分）、向量入库、搜索与对话、HTML 报告导出。亮点：解析时自动切分图片，检索与对话结果中展示对应图片，提升多模态可读性。

## 仓库结构

- `backend/`：FastAPI 服务，负责解析、索引、检索、聊天，连接 Milvus；详细见 `backend/README.md`
- `frontend/`：React Router 7 前端，提供知识库管理、文档上传解析、检索与对话界面
- `docs/`：流程与方案说明

## 快速开始

1. 启动后端

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```

如需更多 API 说明与环境变量示例，请阅读 `backend/README.md`。

2. 启动前端

```bash
cd frontend
pnpm install
pnpm dev   # 默认 http://localhost:5173，对接后端 http://localhost:8010
```

若后端地址变化，修改 `frontend/app/lib/api.ts` 中的 `API_BASE_URL` 后再运行。

## 配置要点

- 后端依赖 Milvus；关键环境变量：`MILVUS_HOST`、`MILVUS_PORT`、`MILVUS_COLLECTION_NAME`、`EMBEDDING_MODEL`、`EMBEDDING_BASE_URL`
- 切片参数（可选）：`DEFAULT_MAX_CHUNK_SIZE`、`DEFAULT_MIN_CHUNK_SIZE`、`DEFAULT_CHUNK_OVERLAP`
- 前端编译时固定后端地址，请在构建或打包前调整

## 常用入口

- Swagger: `http://localhost:8010/docs`
- ReDoc: `http://localhost:8010/redoc`
- 前端开发: `http://localhost:5173`

更多设计细节与操作说明可参考 `docs/` 下的文档。
