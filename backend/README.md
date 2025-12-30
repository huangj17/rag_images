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
│   │   └── schemas.py       # Pydantic 请求/响应模型
│   ├── api/
│   │   ├── __init__.py
│   │   └── endpoints/
│   │       ├── __init__.py
│   │       ├── documents.py # 文档解析接口
│   │       └── search.py    # 搜索和索引接口
│   └── services/
│       ├── __init__.py
│       ├── document_parser.py   # 文档解析服务
│       └── rag_store.py         # RAG 存储服务
├── milvusRAG/               # Milvus 工具类
├── extracted_images/        # 提取的图片目录
├── data/                   # 测试数据目录
└── requirements.txt         # 依赖文件
```

## 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

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

| 方法 | 路径                             | 说明                |
| ---- | -------------------------------- | ------------------- |
| GET  | `/api/health`                    | 健康检查            |
| POST | `/api/documents/parse`           | 解析单个文档        |
| POST | `/api/documents/parse-directory` | 解析目录下所有文档  |
| POST | `/api/index`                     | 索引文档块到 Milvus |
| POST | `/api/search`                    | 搜索相关文档        |
| POST | `/api/search/export-html`        | 导出搜索结果为 HTML |
| GET  | `/api/search/html/{filename}`    | 获取 HTML 报告文件  |

## 使用示例

### 1. 解析文档

```bash
curl -X POST "http://localhost:8010/api/documents/parse" \
  -H "Content-Type: application/json" \
  -d '{
    "file_path": "./data/TRON1 RL训练部署快速上手（Isaac Gym）.docx"
  }'
```

### 2. 解析目录

```bash
curl -X POST "http://localhost:8010/api/documents/parse-directory" \
  -H "Content-Type: application/json" \
  -d '{
    "dir_path": "./data",
    "extensions": [".docx", ".md"]
  }'
```

### 3. 索引文档块

```bash
curl -X POST "http://localhost:8010/api/index" \
  -H "Content-Type: application/json" \
  -d '{
    "chunks": [...],
    "drop_old": true
  }'
```

### 4. 搜索

```bash
curl -X POST "http://localhost:8010/api/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何安装 Nvidia 驱动",
    "top_k": 5
  }'
```

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

# 切片默认配置
DEFAULT_MAX_CHUNK_SIZE=800
DEFAULT_MIN_CHUNK_SIZE=100
DEFAULT_CHUNK_OVERLAP=100
```
