"""
搜索和索引 API 端点
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.dependencies import app_state, ensure_milvus_connected
from app.models.schemas import (
    DocumentChunkSchema,
    IndexChunksRequest,
    IndexResponse,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
)
from app.services.document_parser import DocumentChunk

router = APIRouter(tags=["搜索与索引"])


def _convert_schema_to_chunk(chunk_schema: DocumentChunkSchema) -> DocumentChunk:
    """将 Pydantic 模型转换为 DocumentChunk"""
    return DocumentChunk(
        chunk_id=chunk_schema.chunk_id,
        text=chunk_schema.text,
        source_file=chunk_schema.source_file,
        section=chunk_schema.section,
        page_number=chunk_schema.page_number,
        images=chunk_schema.images,
        metadata=chunk_schema.metadata,
    )


@router.post("/index", response_model=IndexResponse, summary="索引文档块到向量数据库")
async def index_chunks(request: IndexChunksRequest):
    """
    将文档块索引到 Milvus 向量数据库

    - **chunks**: 要索引的文档块列表
    - **collection_name**: 可选的集合名称
    - **drop_old**: 是否删除已有集合
    """
    if not request.chunks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文档块列表不能为空",
        )

    try:
        # 确保 Milvus 已连接
        collection_name = request.collection_name or settings.MILVUS_COLLECTION_NAME
        if not ensure_milvus_connected(collection_name, request.drop_old):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="无法连接到 Milvus 数据库",
            )

        # 转换为 DocumentChunk
        chunks = [_convert_schema_to_chunk(c) for c in request.chunks]

        # 索引
        rag_store = app_state.rag_store
        if rag_store is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="RAG 存储未初始化",
            )

        success = rag_store.index_chunks(chunks)

        if success:
            return IndexResponse(
                success=True,
                message=f"成功索引 {len(chunks)} 个文档块到集合 {collection_name}",
                indexed_count=len(chunks),
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="索引失败",
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"索引失败: {str(e)}",
        )


@router.post("/search", response_model=SearchResponse, summary="搜索相关文档")
async def search(request: SearchRequest):
    """
    在向量数据库中搜索相关文档块

    - **query**: 查询文本
    - **top_k**: 返回结果数量
    - **with_images_only**: 是否只返回包含图片的结果
    - **collection_name**: 可选的集合名称
    """
    if not request.query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="查询文本不能为空",
        )

    try:
        # 确保 Milvus 已连接
        collection_name = request.collection_name or settings.MILVUS_COLLECTION_NAME
        if not ensure_milvus_connected(collection_name):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="无法连接到 Milvus 数据库",
            )

        rag_store = app_state.rag_store
        if rag_store is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="RAG 存储未初始化",
            )

        # 执行搜索
        results = rag_store.search(
            query=request.query,
            top_k=request.top_k,
            with_images_only=request.with_images_only,
        )

        # 转换结果
        search_results = [
            SearchResultItem(
                chunk_id=r["chunk_id"],
                text=r["text"],
                source_file=r["source_file"],
                section=r["section"],
                images=r["images"],
                page_number=r["page_number"],
                score=r["score"],
                text_length=r["text_length"],
            )
            for r in results
        ]

        return SearchResponse(
            success=True,
            message=f"找到 {len(search_results)} 条相关结果",
            query=request.query,
            results=search_results,
            total=len(search_results),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"搜索失败: {str(e)}",
        )
