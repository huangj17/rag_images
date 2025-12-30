# RAG 图文混合文档处理系统 - FastAPI 版

## 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 应用入口
│   ├── config.py            # 配置管理
│   ├── dependencies.py      # 依赖注入
│   ├── models/
│   │   ├── __init__.py
│   │   ├── schemas.py       # Pydantic 请求/响应模型
│   │   └── knowledge_base.py# 知识库（SQLite）模型
│   ├── api/
│   │   ├── __init__.py
│   │   └── endpoints/
│   │       ├── __init__.py
│   │       ├── documents.py # 文档解析接口
│   │       ├── search.py    # 搜索和索引接口
│   │       ├── chat.py      # 问答（SSE）接口
│   │       └── knowledge_base.py # 知识库 CRUD 接口
│   └── services/
│       ├── __init__.py
│       ├── document_parser.py   # 文档解析服务
│       └── rag_store.py         # RAG 存储服务
│       └── milvus/          # Milvus + Embedding + LLM 客户端/构建器
├── extracted_images/        # 提取的图片目录
├── data/                   # 测试数据目录
├── rag_kb.sqlite3           # 知识库元数据 SQLite（运行后生成/更新）
└── requirements.txt         # 依赖文件
```

## 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

## 配置环境变量

**⚠️ 首次运行前必须配置 API Key**

1. 复制示例配置文件：

```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，填写真实的 `OLLAMA_API_KEY`：

```env
OLLAMA_API_KEY=your_actual_api_key_here
```

3. 其他配置项可根据实际环境调整（如 Milvus 地址、模型名称等）

> **安全提示**：`.env` 文件已在 `.gitignore` 中排除，不会被提交到代码仓库。切勿将真实密钥硬编码到代码中。

## 启动服务

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8010
```

或者直接运行：

```bash
cd backend
python -m app.main
```

## API 文档

启动服务后访问：

- Swagger UI: http://localhost:8010/docs
- ReDoc: http://localhost:8010/redoc

## API 接口

| 方法   | 路径                           | 说明                                                       |
| ------ | ------------------------------ | ---------------------------------------------------------- |
| GET    | `/api/health`                  | 健康检查（含 Milvus 连接状态）                             |
| GET    | `/api/images/{image_path}`     | 获取图片（支持绝对路径或相对 `extracted_images/`）         |
| POST   | `/api/documents/parse`         | 解析单个文档（服务器文件路径）                             |
| POST   | `/api/documents/upload`        | 上传并解析文档（可选直接入库，默认避免重复导入）           |
| POST   | `/api/index`                   | 索引文档块到 Milvus                                        |
| POST   | `/api/search`                  | 搜索相关文档（可选仅返回含图片结果）                       |
| POST   | `/api/chat`                    | RAG 问答（SSE 流式）                                       |
| POST   | `/api/chat/sync`               | RAG 问答（非流式）                                         |
| GET    | `/api/knowledge-bases`         | 获取知识库列表（SQLite 元数据 + 尽力从 Milvus 同步条目数） |
| POST   | `/api/knowledge-bases`         | 创建知识库（collection_name 对应 Milvus collection）       |
| GET    | `/api/knowledge-bases/{kb_id}` | 获取知识库详情                                             |
| PUT    | `/api/knowledge-bases/{kb_id}` | 更新知识库                                                 |
| DELETE | `/api/knowledge-bases/{kb_id}` | 删除知识库（尽力删除对应 Milvus collection）               |

## 使用示例

### 1) 上传并解析（推荐）

支持 `.docx / .md / .pdf`。可选 `store_to_vector=true` 直接入库；默认 `replace_existing=true` 避免重复导入同一文件。

```bash
curl -X POST "http://localhost:8010/api/documents/upload" \
  -F "file=@./data/TRON1 RL训练部署快速上手（Isaac Gym）.docx" \
  -F "store_to_vector=true" \
  -F "collection_name=doc_image_chunks_optimized" \
  -F 'config_json={"max_chunk_size":800,"min_chunk_size":100,"chunk_overlap":100,"split_by_title":true,"split_by_paragraph":true,"force_max_size":true,"distribute_images_evenly":true}'
```

### 2) 解析单个文档（服务器已有文件路径）

```bash
curl -X POST "http://localhost:8010/api/documents/parse" \
  -H "Content-Type: application/json" \
  -d '{
    "file_path": "./data/TRON1 RL训练部署快速上手（Isaac Gym）.docx",
    "config": {
      "max_chunk_size": 800,
      "min_chunk_size": 100,
      "chunk_overlap": 100
    }
  }'
```

### 3) 索引文档块

```bash
curl -X POST "http://localhost:8010/api/index" \
  -H "Content-Type: application/json" \
  -d '{
    "chunks": [...],
    "collection_name": "doc_image_chunks_optimized",
    "drop_old": true
  }'
```

### 4) 搜索

```bash
curl -X POST "http://localhost:8010/api/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何安装 Nvidia 驱动",
    "top_k": 5,
    "with_images_only": false,
    "collection_name": "doc_image_chunks_optimized"
  }'
```

### 5) 流式对话（SSE）

```bash
curl -N -X POST "http://localhost:8010/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何部署到真机？",
    "top_k": 5,
    "collection_name": "doc_image_chunks_optimized",
    "history": []
  }'
```

## 图片与 `[IMG:...]` 说明（重要）

- 文档解析会尽力在图片“原位置”插入占位符：`[IMG:/abs/path/to/image.png]`
- 前端会识别该占位符并通过后端图片 API 渲染：`GET /api/images/{image_path}`
- 若解析器无法定位图片原位置，会将剩余图片按配置均匀分配到各 chunk（或集中分配）

## 配置说明

可以通过环境变量或 `.env` 文件配置：

```env
# Milvus 配置
MILVUS_HOST=127.0.0.1
MILVUS_PORT=19530
MILVUS_DB_NAME=milvus_demo
MILVUS_COLLECTION_NAME=doc_image_chunks_optimized

# Embedding 配置
EMBEDDING_MODEL=qwen3-embedding:4b
EMBEDDING_BASE_URL=http://localhost:11434

# LLM 配置（可选但推荐）
LLM_MODEL=gpt-oss:120b
LLM_BASE_URL=https://ollama.com
LLM_TEMPERATURE=0.7
OLLAMA_API_KEY=YOUR_API_KEY

# 切片默认配置
DEFAULT_MAX_CHUNK_SIZE=800
DEFAULT_MIN_CHUNK_SIZE=100
DEFAULT_CHUNK_OVERLAP=100
```

## 知识库（Knowledge Base）说明

- 系统使用 SQLite（默认 `backend/rag_kb.sqlite3`）保存知识库元数据
- 每个知识库对应一个 **Milvus collection**（字段 `collection_name`）
- `collection_name` 仅允许 **字母/数字/下划线**（不允许 `-`）

## 备注：HTML 报告导出

后端内置了 `app/services/rag_store.py` 的 `export_results_to_html()` 用于将检索结果导出为本地 HTML（支持图片展示）。当前版本**未对外暴露 HTTP API**，如需以接口方式使用可再补一个 endpoint。
