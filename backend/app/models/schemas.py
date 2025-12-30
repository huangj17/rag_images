"""
Pydantic 请求/响应模型定义
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

# ==================== 切片配置模型 ====================


class ChunkingConfigSchema(BaseModel):
    """切片配置参数"""

    max_chunk_size: int = Field(default=800, description="最大块大小（字符数）")
    min_chunk_size: int = Field(default=100, description="最小块大小")
    chunk_overlap: int = Field(default=100, description="块之间的重叠字符数")
    split_by_title: bool = Field(default=True, description="是否按标题切分")
    split_by_paragraph: bool = Field(default=True, description="是否按段落切分")
    force_max_size: bool = Field(default=True, description="是否强制限制最大长度")
    distribute_images_evenly: bool = Field(default=True, description="是否均匀分配图片")
    title_patterns: Optional[List[str]] = Field(
        default=None, description="额外的标题识别正则模式"
    )


# ==================== 文档块模型 ====================


class DocumentChunkSchema(BaseModel):
    """文档块响应模型"""

    chunk_id: str = Field(description="块唯一ID")
    text: str = Field(description="文本内容")
    source_file: str = Field(description="来源文件")
    section: str = Field(description="所属章节")
    page_number: int = Field(description="页码")
    images: List[str] = Field(description="关联图片路径列表")
    metadata: Dict[str, Any] = Field(description="其他元数据")


# ==================== 请求模型 ====================


class ParseDocumentRequest(BaseModel):
    """解析单个文档请求"""

    file_path: str = Field(description="文档文件路径")
    config: Optional[ChunkingConfigSchema] = Field(default=None, description="切片配置")


class IndexChunksRequest(BaseModel):
    """索引文档块请求"""

    chunks: List[DocumentChunkSchema] = Field(description="要索引的文档块列表")
    collection_name: Optional[str] = Field(default=None, description="集合名称")
    drop_old: bool = Field(default=False, description="是否删除已有集合")


class SearchRequest(BaseModel):
    """搜索请求"""

    query: str = Field(description="查询文本")
    top_k: int = Field(default=5, description="返回结果数量")
    with_images_only: bool = Field(default=False, description="是否只返回含图片的结果")
    collection_name: Optional[str] = Field(default=None, description="集合名称")


# ==================== 响应模型 ====================


class ParseResponse(BaseModel):
    """解析响应"""

    success: bool = Field(description="是否成功")
    message: str = Field(description="消息")
    chunks: List[DocumentChunkSchema] = Field(
        default=[], description="解析得到的文档块"
    )
    statistics: Dict[str, Any] = Field(default={}, description="统计信息")


class IndexResponse(BaseModel):
    """索引响应"""

    success: bool = Field(description="是否成功")
    message: str = Field(description="消息")
    indexed_count: int = Field(default=0, description="成功索引的文档数量")


class SearchResultItem(BaseModel):
    """单个搜索结果"""

    chunk_id: str = Field(description="块ID")
    text: str = Field(description="文本内容")
    source_file: str = Field(description="来源文件")
    section: str = Field(description="章节")
    images: List[str] = Field(description="关联图片")
    page_number: int = Field(description="页码")
    score: float = Field(description="相似度分数")
    text_length: int = Field(description="文本长度")


class SearchResponse(BaseModel):
    """搜索响应"""

    success: bool = Field(description="是否成功")
    message: str = Field(description="消息")
    query: str = Field(description="查询文本")
    results: List[SearchResultItem] = Field(default=[], description="搜索结果")
    total: int = Field(default=0, description="结果总数")


class HealthResponse(BaseModel):
    """健康检查响应"""

    status: str = Field(description="服务状态")
    version: str = Field(description="版本号")
    milvus_connected: bool = Field(description="Milvus 连接状态")


# ==================== Chat 模型 ====================


class ChatMessage(BaseModel):
    """对话消息"""

    role: Literal["user", "assistant"] = Field(description="消息角色")
    content: str = Field(description="消息内容")


class ChatRequest(BaseModel):
    """Chat 请求"""

    query: str = Field(description="用户问题")
    history: List[ChatMessage] = Field(default=[], description="对话历史")
    top_k: int = Field(default=5, description="检索文档数量")
    collection_name: Optional[str] = Field(default=None, description="集合名称")


class ChatSourceDocument(BaseModel):
    """引用的源文档"""

    chunk_id: str = Field(description="块ID")
    text: str = Field(description="文本片段")
    source_file: str = Field(description="来源文件")
    section: str = Field(description="章节")
    score: float = Field(description="相似度分数")


class ChatStreamEvent(BaseModel):
    """Chat 流式事件"""

    event: Literal["start", "token", "sources", "end", "error"] = Field(
        description="事件类型"
    )
    data: Optional[str] = Field(default=None, description="事件数据（token内容）")
    sources: Optional[List[ChatSourceDocument]] = Field(
        default=None, description="引用源文档"
    )
    message: Optional[str] = Field(default=None, description="消息（用于error事件）")


# ==================== Knowledge Base（知识库）模型 ====================


class KnowledgeBaseCreateRequest(BaseModel):
    """创建知识库请求"""

    name: str = Field(description="知识库名称")
    description: Optional[str] = Field(default=None, description="知识库描述")
    collection_name: str = Field(description="对应的 Milvus collection 名称")


class KnowledgeBaseUpdateRequest(BaseModel):
    """更新知识库请求（仅允许改名称/描述）"""

    name: Optional[str] = Field(default=None, description="知识库名称")
    description: Optional[str] = Field(default=None, description="知识库描述")


class KnowledgeBaseResponse(BaseModel):
    """知识库响应"""

    id: str = Field(description="知识库 ID")
    name: str = Field(description="知识库名称")
    description: Optional[str] = Field(default=None, description="知识库描述")
    collection_name: str = Field(description="对应的 Milvus collection 名称")
    document_count: int = Field(description="文档数量（统计值）")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")


class KnowledgeBaseListResponse(BaseModel):
    """知识库列表响应"""

    success: bool = Field(description="是否成功")
    items: List[KnowledgeBaseResponse] = Field(default=[], description="知识库列表")
