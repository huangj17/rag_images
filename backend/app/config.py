"""
应用配置管理

统一管理所有配置项，包括：
- 应用基础配置
- Milvus 数据库配置
- Embedding/LLM 模型配置
- 索引和搜索配置
- RAG 工作流配置
"""

import os
from pathlib import Path
from typing import Any, Dict

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用配置"""

    # ==================== 应用基本配置 ====================
    APP_NAME: str = "RAG 图文混合文档处理系统"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # ==================== 路径配置 ====================
    BASE_DIR: Path = Path(__file__).parent.parent
    IMAGE_OUTPUT_DIR: Path = BASE_DIR / "extracted_images"
    DATA_DIR: Path = BASE_DIR / "data"
    WORKFLOW_GRAPH_PATH: str = "./workflow_graph.png"

    # ==================== 知识库元数据存储（SQLite） ====================
    # 默认在 backend 目录下生成 rag_kb.sqlite3（因为通常以 `cd backend` 启动服务）
    DATABASE_URL: str = "sqlite+aiosqlite:///./rag_kb.sqlite3"
    DB_ECHO: bool = False

    # ==================== Milvus 配置 ====================
    MILVUS_HOST: str = "127.0.0.1"
    MILVUS_PORT: int = 19530
    MILVUS_DB_NAME: str = "milvus_demo"
    MILVUS_COLLECTION_NAME: str = "doc_image_chunks_optimized"

    # ==================== Embedding 配置 ====================
    EMBEDDING_MODEL: str = "qwen3-embedding:4b"
    EMBEDDING_BASE_URL: str = "http://localhost:11434"

    # ==================== LLM 配置 ====================
    LLM_MODEL: str = "gpt-oss:120b"  # gpt-oss:120b  qwen3-vl:235b  qwen3-next:80b
    LLM_BASE_URL: str = "https://ollama.com"
    LLM_TEMPERATURE: float = 0.7
    OLLAMA_API_KEY: str = "7fdc88bd43af4c7597f0f90f71e2a8ac.mUMETnGBzVhupx_DDTcferuB"

    # ==================== 索引配置 ====================
    INDEX_TYPE: str = "HNSW"
    METRIC_TYPE: str = "L2"
    HNSW_M: int = 16
    HNSW_EF_CONSTRUCTION: int = 200
    HNSW_EF: int = 64

    # ==================== 切片配置 ====================
    DEFAULT_MAX_CHUNK_SIZE: int = 800
    DEFAULT_MIN_CHUNK_SIZE: int = 100
    DEFAULT_CHUNK_OVERLAP: int = 100

    # ==================== 搜索配置 ====================
    DEFAULT_TOP_K: int = 5
    DEFAULT_SEARCH_K: int = 3
    MMR_FETCH_K: int = 20
    MMR_LAMBDA: float = 0.5

    # ==================== RAG 工作流配置 ====================
    RETRIEVER_TOOL_NAME: str = "retrieve_documents"
    RETRIEVER_TOOL_DESCRIPTION: str = "搜索并返回相关文档"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    # ==================== 配置辅助方法 ====================

    def get_index_params(self) -> Dict[str, Any]:
        """获取索引参数"""
        return {
            "index_type": self.INDEX_TYPE,
            "metric_type": self.METRIC_TYPE,
            "params": {
                "M": self.HNSW_M,
                "efConstruction": self.HNSW_EF_CONSTRUCTION,
            },
        }

    def get_search_params(self) -> Dict[str, Any]:
        """获取搜索参数"""
        return {
            "metric_type": self.METRIC_TYPE,
            "params": {
                "ef": self.HNSW_EF,
            },
        }

    def get_connection_args(self) -> Dict[str, str]:
        """获取 Milvus 连接参数"""
        return {
            "uri": f"http://{self.MILVUS_HOST}:{self.MILVUS_PORT}",
            "token": "root:Milvus",
            "db_name": self.MILVUS_DB_NAME,
        }


# 全局配置实例
settings = Settings()

# 设置环境变量
if not os.environ.get("OLLAMA_API_KEY"):
    os.environ["OLLAMA_API_KEY"] = settings.OLLAMA_API_KEY

# 确保图片输出目录存在（Path 类型需要显式转换）
Path(settings.IMAGE_OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
