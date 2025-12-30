"""
依赖注入管理

提供 FastAPI 路由的依赖项
"""

import re
from typing import Optional

from app.config import settings
from app.services.chat_service import ChatService
from app.services.document_parser import ChunkingConfig, OptimizedDocumentParser
from app.services.milvus import MilvusClient
from app.services.rag_store import RAGImageStore

# ==================== 全局实例 ====================


class AppState:
    """应用全局状态"""

    def __init__(self):
        self._milvus_util = None
        self._rag_store = None
        self._chat_service = None
        self._parser = None
        self._is_milvus_connected = False

    @property
    def milvus_util(self):
        return self._milvus_util

    @property
    def rag_store(self):
        return self._rag_store

    @property
    def chat_service(self):
        return self._chat_service

    @property
    def parser(self):
        return self._parser

    @property
    def is_milvus_connected(self) -> bool:
        return self._is_milvus_connected

    def init_milvus(
        self,
        collection_name: Optional[str] = None,
        drop_old: bool = False,
    ) -> bool:
        """
        初始化 Milvus 连接

        Args:
            collection_name: 集合名称
            drop_old: 是否删除已有集合

        Returns:
            是否成功
        """
        try:
            target_collection = collection_name or settings.MILVUS_COLLECTION_NAME
            # Milvus collection name 只能包含字母/数字/下划线
            if not re.fullmatch(r"[A-Za-z0-9_]+", target_collection or ""):
                print(
                    f"❌ 非法 collection_name: {target_collection}（仅允许字母/数字/下划线）"
                )
                self._is_milvus_connected = False
                return False

            # MilvusClient 默认使用 settings 配置，只需传入需要覆盖的参数
            self._milvus_util = MilvusClient(
                collection_name=target_collection,
                drop_old=drop_old,
                verbose=settings.DEBUG,
            )

            # 连接和初始化
            if self._milvus_util.connect() and self._milvus_util.setup_database():
                if not self._milvus_util.init_embeddings():
                    return False
                if not self._milvus_util.create_vector_store():
                    self._is_milvus_connected = False
                    return False
                if not self._milvus_util.init_response_model():  # 初始化 LLM
                    self._is_milvus_connected = False
                    return False

                self._is_milvus_connected = True

                # 初始化 RAG Store
                self._rag_store = RAGImageStore(
                    self._milvus_util,
                    collection_name=target_collection,
                )

                # 初始化 Chat Service
                self._chat_service = ChatService(
                    milvus_client=self._milvus_util,
                    rag_store=self._rag_store,
                )

                print("✅ Milvus 初始化成功")
                return True
            else:
                print("❌ Milvus 连接失败")
                return False

        except Exception as e:
            print(f"❌ Milvus 初始化失败: {e}")
            return False

    def init_parser(
        self, config: Optional[ChunkingConfig] = None
    ) -> OptimizedDocumentParser:
        """
        初始化文档解析器

        Args:
            config: 切片配置

        Returns:
            解析器实例
        """
        if config is None:
            config = ChunkingConfig(
                max_chunk_size=settings.DEFAULT_MAX_CHUNK_SIZE,
                min_chunk_size=settings.DEFAULT_MIN_CHUNK_SIZE,
                chunk_overlap=settings.DEFAULT_CHUNK_OVERLAP,
            )

        self._parser = OptimizedDocumentParser(
            image_output_dir=str(settings.IMAGE_OUTPUT_DIR),
            config=config,
        )
        return self._parser

    def close(self):
        """关闭所有连接"""
        if self._milvus_util:
            try:
                self._milvus_util.close()
                self._is_milvus_connected = False
                print("✅ Milvus 连接已关闭")
            except Exception as e:
                print(f"⚠️ 关闭 Milvus 连接失败: {e}")


# 全局应用状态
app_state = AppState()


# ==================== FastAPI 依赖函数 ====================


def get_app_state() -> AppState:
    """获取应用状态"""
    return app_state


def get_parser(config: Optional[ChunkingConfig] = None) -> OptimizedDocumentParser:
    """
    获取文档解析器

    Args:
        config: 可选的切片配置

    Returns:
        解析器实例
    """
    if app_state.parser is None or config is not None:
        return app_state.init_parser(config)
    return app_state.parser


def get_rag_store() -> Optional[RAGImageStore]:
    """
    获取 RAG 存储

    Returns:
        RAG 存储实例，如果未初始化则返回 None
    """
    return app_state.rag_store


def get_chat_service() -> Optional[ChatService]:
    """
    获取 Chat 服务

    Returns:
        Chat 服务实例，如果未初始化则返回 None
    """
    return app_state.chat_service


def ensure_milvus_connected(
    collection_name: Optional[str] = None,
    drop_old: bool = False,
) -> bool:
    """
    确保 Milvus 已连接且 collection 存在

    Args:
        collection_name: 集合名称
        drop_old: 是否删除已有集合

    Returns:
        是否已连接
    """
    target_collection = collection_name or settings.MILVUS_COLLECTION_NAME

    # Milvus collection name 只能包含字母/数字/下划线
    if not re.fullmatch(r"[A-Za-z0-9_]+", target_collection or ""):
        print(f"❌ 非法 collection_name: {target_collection}（仅允许字母/数字/下划线）")
        return False

    if not app_state.is_milvus_connected:
        return app_state.init_milvus(target_collection, drop_old)

    # 若当前已连接但 collection 不同，则切换到目标 collection（支持多知识库）
    try:
        current_collection = (
            app_state.milvus_util.collection_name if app_state.milvus_util else None
        )
    except Exception:
        current_collection = None

    if current_collection and current_collection != target_collection:
        print(f"🔁 切换 collection: {current_collection} -> {target_collection}")
        app_state._is_milvus_connected = False
        return app_state.init_milvus(target_collection, drop_old)

    # 检查 collection 是否真的存在（Milvus 服务重启后可能丢失）
    try:
        from pymilvus import utility

        existing_collections = utility.list_collections()

        if target_collection not in existing_collections:
            print(f"⚠️ Collection '{target_collection}' 不存在，重新初始化...")
            # 重置连接状态，重新初始化
            app_state._is_milvus_connected = False
            return app_state.init_milvus(target_collection, drop_old)
    except Exception as e:
        print(f"⚠️ 检查 collection 失败: {e}，尝试重新初始化...")
        app_state._is_milvus_connected = False
        return app_state.init_milvus(target_collection, drop_old)

    return True
