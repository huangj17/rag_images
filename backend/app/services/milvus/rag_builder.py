"""
RAG 索引构建器

功能：
1. 支持多种文档格式的加载（PDF、Markdown、TXT、CSV、HTML、DOCX 等）
2. 智能文档分割
3. 向量化并存储到 Milvus
4. 提供完整的 RAG 索引构建流程

说明：
- 本模块专注于 LangChain 原生文档加载（适用于纯文本 RAG）
- 如需图文混合解析，请使用 app.services.document_parser
"""

from pathlib import Path
from typing import List, Optional

from langchain_community.document_loaders import (
    CSVLoader,
    PyPDFLoader,
    TextLoader,
    UnstructuredHTMLLoader,
    UnstructuredWordDocumentLoader,
)
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings
from app.services.milvus.client import MilvusClient

# ==================== 支持的文件类型映射 ====================

LOADER_MAPPING = {
    ".pdf": PyPDFLoader,
    ".md": TextLoader,
    ".txt": TextLoader,
    ".log": TextLoader,
    ".csv": CSVLoader,
    ".html": UnstructuredHTMLLoader,
    ".htm": UnstructuredHTMLLoader,
    ".docx": UnstructuredWordDocumentLoader,
    ".doc": UnstructuredWordDocumentLoader,
}

SUPPORTED_EXTENSIONS = list(LOADER_MAPPING.keys())


class RAGBuilder:
    """
    RAG 索引构建类

    职责：
    - 加载各种格式的文档
    - 智能文档分割
    - 构建 RAG 索引
    """

    def __init__(
        self,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
    ):
        """
        初始化构建器

        Args:
            chunk_size: 分块大小（默认使用配置）
            chunk_overlap: 分块重叠大小（默认使用配置）
        """
        self.chunk_size = chunk_size or settings.DEFAULT_MAX_CHUNK_SIZE
        self.chunk_overlap = chunk_overlap or settings.DEFAULT_CHUNK_OVERLAP

    # ==================== 文档加载 ====================

    def get_loader(self, file_path: str):
        """
        根据文件路径获取合适的 loader 实例

        Args:
            file_path: 文件路径

        Returns:
            Loader 实例

        Raises:
            ValueError: 不支持的文件类型
        """
        path = Path(file_path)
        ext = path.suffix.lower()

        if ext not in LOADER_MAPPING:
            raise ValueError(
                f"不支持的文件类型: {ext}，支持的类型: {SUPPORTED_EXTENSIONS}"
            )

        loader_cls = LOADER_MAPPING[ext]

        # TextLoader 需要指定编码
        if loader_cls == TextLoader:
            return loader_cls(str(path), encoding="utf-8")

        return loader_cls(str(path))

    def load_file(self, file_path: str) -> List[Document]:
        """加载单个文件"""
        try:
            loader = self.get_loader(file_path)
            return loader.load()
        except Exception as e:
            print(f"⚠️ 加载文件 {file_path} 时出错: {e}")
            return []

    def load_directory(
        self,
        dir_path: str,
        extensions: Optional[List[str]] = None,
        recursive: bool = True,
    ) -> List[Document]:
        """
        加载目录内的所有可识别文件

        Args:
            dir_path: 目录路径
            extensions: 要加载的文件扩展名列表（默认加载所有支持的类型）
            recursive: 是否递归遍历子目录

        Returns:
            List[Document]: 加载的文档列表
        """
        root_path = Path(dir_path)

        if not root_path.exists():
            print(f"❌ 目录不存在: {dir_path}")
            return []

        target_extensions = extensions or SUPPORTED_EXTENSIONS
        target_extensions = [ext.lower() for ext in target_extensions]

        docs = []
        pattern = "**/*" if recursive else "*"

        for file_path in root_path.glob(pattern):
            if file_path.is_file() and file_path.suffix.lower() in target_extensions:
                file_docs = self.load_file(str(file_path))
                if file_docs:
                    docs.extend(file_docs)
                    print(f"✓ 已加载: {file_path.name} ({len(file_docs)} 个文档)")

        print(f"📊 共加载 {len(docs)} 个文档")
        return docs

    # ==================== 文档分割 ====================

    def split_documents(
        self,
        docs: List[Document],
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
        use_tiktoken: bool = False,
    ) -> List[Document]:
        """
        分割文档

        Args:
            docs: 文档列表
            chunk_size: 分块大小（默认使用实例配置）
            chunk_overlap: 分块重叠大小（默认使用实例配置）
            use_tiktoken: 是否使用 tiktoken 编码器

        Returns:
            List[Document]: 分割后的文档片段
        """
        size = chunk_size or self.chunk_size
        overlap = chunk_overlap or self.chunk_overlap

        if use_tiktoken:
            text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
                chunk_size=size,
                chunk_overlap=overlap,
            )
        else:
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=size,
                chunk_overlap=overlap,
                length_function=len,
                is_separator_regex=False,
            )

        return text_splitter.split_documents(docs)

    # ==================== RAG 索引构建 ====================

    def build_index(
        self,
        data_dir: str,
        db_name: Optional[str] = None,
        collection_name: Optional[str] = None,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
        drop_old: bool = False,
        verbose: bool = True,
    ) -> Optional[MilvusClient]:
        """
        构建 RAG 索引：加载文档 -> 分割 -> 向量化 -> 存储到 Milvus

        Args:
            data_dir: 数据目录路径
            db_name: Milvus 数据库名称（默认使用配置）
            collection_name: 集合名称（默认使用配置）
            chunk_size: 文档分块大小（默认使用实例配置）
            chunk_overlap: 分块重叠大小（默认使用实例配置）
            drop_old: 是否删除已存在的集合
            verbose: 是否显示详细日志

        Returns:
            MilvusClient: 初始化完成的 Milvus 客户端，失败返回 None
        """
        print("=" * 60)
        print("开始构建 RAG 索引")
        print("=" * 60)

        # 1. 初始化 Milvus
        print("\n1. 初始化 Milvus 向量存储")
        milvus = MilvusClient(
            db_name=db_name or settings.MILVUS_DB_NAME,
            collection_name=collection_name or settings.MILVUS_COLLECTION_NAME,
            drop_old=drop_old,
            verbose=verbose,
        )

        if not milvus.initialize():
            print("❌ Milvus 初始化失败")
            return None

        # 2. 加载文档
        print(f"\n2. 加载文档目录: {data_dir}")
        docs = self.load_directory(data_dir)
        if not docs:
            print("❌ 未找到任何文档")
            return None
        print(f"✅ 成功加载 {len(docs)} 个文档")

        # 3. 分割文档
        size = chunk_size or self.chunk_size
        overlap = chunk_overlap or self.chunk_overlap
        print(f"\n3. 分割文档 (chunk_size={size}, overlap={overlap})")
        doc_splits = self.split_documents(docs, chunk_size=size, chunk_overlap=overlap)
        print(f"✅ 分割成 {len(doc_splits)} 个片段")

        # 4. 添加文档到向量存储
        print("\n4. 添加文档到向量存储")
        if not milvus.add_documents(doc_splits):
            print("❌ 添加文档失败")
            return None

        print("\n" + "=" * 60)
        print("🎉 RAG 索引构建完成!")
        print("=" * 60)

        return milvus

    def load_and_split(
        self,
        data_dir: str,
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
    ) -> List[Document]:
        """
        加载并分割文档（不存储到 Milvus）

        Args:
            data_dir: 数据目录路径
            chunk_size: 文档分块大小
            chunk_overlap: 分块重叠大小

        Returns:
            List[Document]: 分割后的文档片段列表
        """
        docs = self.load_directory(data_dir)
        if not docs:
            return []

        return self.split_documents(
            docs,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
