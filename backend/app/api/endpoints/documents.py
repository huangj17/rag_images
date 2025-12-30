"""
文档解析 API 端点
"""

import json
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import app_state, ensure_milvus_connected, get_parser
from app.models.knowledge_base import KnowledgeBase
from app.models.schemas import (
    ChunkingConfigSchema,
    DocumentChunkSchema,
    ParseDocumentRequest,
    ParseResponse,
)
from app.services.document_parser import ChunkingConfig, DocumentChunk

router = APIRouter(prefix="/documents", tags=["文档解析"])


def _convert_config(
    config_schema: Optional[ChunkingConfigSchema],
) -> Optional[ChunkingConfig]:
    """将 Pydantic 模型转换为 dataclass 配置"""
    if config_schema is None:
        return None
    return ChunkingConfig(
        max_chunk_size=config_schema.max_chunk_size,
        min_chunk_size=config_schema.min_chunk_size,
        chunk_overlap=config_schema.chunk_overlap,
        split_by_title=config_schema.split_by_title,
        split_by_paragraph=config_schema.split_by_paragraph,
        force_max_size=config_schema.force_max_size,
        distribute_images_evenly=config_schema.distribute_images_evenly,
        title_patterns=config_schema.title_patterns,
    )


def _convert_chunks(chunks) -> list[DocumentChunkSchema]:
    """将 DocumentChunk 转换为 Pydantic 模型"""
    return [
        DocumentChunkSchema(
            chunk_id=chunk.chunk_id,
            text=chunk.text,
            source_file=chunk.source_file,
            section=chunk.section,
            page_number=chunk.page_number,
            images=chunk.images,
            metadata=chunk.metadata,
        )
        for chunk in chunks
    ]


@router.post("/parse", response_model=ParseResponse, summary="解析单个文档")
async def parse_document(request: ParseDocumentRequest):
    """
    解析单个文档文件

    - **file_path**: 文档文件的绝对路径或相对路径
    - **config**: 可选的切片配置参数
    """
    file_path = Path(request.file_path)

    # 验证文件存在
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"文件不存在: {request.file_path}",
        )

    # 验证文件格式
    supported_formats = [".docx", ".md", ".pdf"]
    if file_path.suffix.lower() not in supported_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件格式: {file_path.suffix}，支持: {supported_formats}",
        )

    try:
        # 转换配置
        config = _convert_config(request.config)

        # 获取解析器
        parser = get_parser(config)

        # 解析文档
        chunks = parser.parse(str(file_path))

        # 统计信息
        statistics = {
            "total_chunks": len(chunks),
            "chunks_with_images": sum(1 for c in chunks if c.images),
            "total_images": sum(len(c.images) for c in chunks),
            "avg_chunk_size": sum(len(c.text) for c in chunks) // len(chunks)
            if chunks
            else 0,
            "max_chunk_size": max(len(c.text) for c in chunks) if chunks else 0,
            "min_chunk_size": min(len(c.text) for c in chunks) if chunks else 0,
        }

        return ParseResponse(
            success=True,
            message=f"成功解析文档: {file_path.name}",
            chunks=_convert_chunks(chunks),
            statistics=statistics,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"解析文档失败: {str(e)}",
        )


@router.post("/upload", response_model=ParseResponse, summary="上传并解析文档")
async def upload_and_parse(
    file: UploadFile = File(..., description="要上传的文档文件"),
    store_to_vector: bool = Form(False, description="是否存储到向量数据库"),
    collection_name: Optional[str] = Form(None, description="目标 collection 名称"),
    replace_existing: bool = Form(
        True, description="是否替换同一文件的已有数据（避免重复）"
    ),
    config_json: Optional[str] = Form(None, description="切片配置 JSON 字符串"),
    db: AsyncSession = Depends(get_db),
):
    """
    上传文档文件并进行解析

    - **file**: 上传的文档文件 (支持 .docx, .md, .pdf)
    - **store_to_vector**: 是否将解析结果存储到向量数据库
    - **replace_existing**: 是否替换同一文件的已有数据，默认 True（避免重复导入）
    - **config_json**: 可选的切片配置，JSON 格式字符串
    """
    # 验证文件格式
    supported_formats = [".docx", ".md", ".pdf"]
    file_ext = Path(file.filename or "").suffix.lower()
    if file_ext not in supported_formats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件格式: {file_ext}，支持: {supported_formats}",
        )

    # 解析配置 JSON
    config_schema = None
    if config_json:
        try:
            config_dict = json.loads(config_json)
            config_schema = ChunkingConfigSchema(**config_dict)
        except (json.JSONDecodeError, ValueError) as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"配置 JSON 格式错误: {str(e)}",
            )

    # 创建临时文件保存上传内容
    temp_dir = tempfile.mkdtemp()
    temp_file_path = Path(temp_dir) / file.filename

    try:
        # 保存上传的文件
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 转换配置
        config = _convert_config(config_schema)

        # 获取解析器并解析文档
        parser = get_parser(config)
        chunks = parser.parse(str(temp_file_path))

        # 统计信息
        statistics = {
            "total_chunks": len(chunks),
            "chunks_with_images": sum(1 for c in chunks if c.images),
            "total_images": sum(len(c.images) for c in chunks),
            "avg_chunk_size": sum(len(c.text) for c in chunks) // len(chunks)
            if chunks
            else 0,
            "max_chunk_size": max(len(c.text) for c in chunks) if chunks else 0,
            "min_chunk_size": min(len(c.text) for c in chunks) if chunks else 0,
            "stored_to_vector": False,
        }

        # 如果需要存储到向量库
        if store_to_vector and chunks:
            try:
                target_collection = collection_name or settings.MILVUS_COLLECTION_NAME
                if ensure_milvus_connected(target_collection):
                    rag_store = app_state.rag_store
                    if rag_store:
                        success = rag_store.index_chunks(
                            chunks, replace_existing=replace_existing
                        )
                        statistics["stored_to_vector"] = success
                        statistics["replaced_existing"] = replace_existing
                        statistics["collection_name"] = target_collection
                        if success:
                            statistics["indexed_count"] = len(chunks)

                            # 更新对应知识库的条目数（若存在该 collection 的知识库记录）
                            try:
                                from pymilvus import Collection
                                from pymilvus import db as milvus_db

                                try:
                                    milvus_db.using_database(settings.MILVUS_DB_NAME)
                                except Exception:
                                    # 统计更新失败不影响主流程
                                    raise

                                col = Collection(name=target_collection)
                                # 确保统计可见
                                try:
                                    col.flush()
                                except Exception:
                                    pass
                                col.load()
                                total_entities = int(getattr(col, "num_entities", 0))

                                result = await db.execute(
                                    select(KnowledgeBase).where(
                                        KnowledgeBase.collection_name
                                        == target_collection
                                    )
                                )
                                kb = result.scalars().first()
                                if kb:
                                    kb.document_count = total_entities
                                    await db.commit()
                            except Exception:
                                # 统计更新失败不影响主流程
                                await db.rollback()
            except Exception as e:
                # 存储失败不影响解析结果返回
                statistics["vector_store_error"] = str(e)

        return ParseResponse(
            success=True,
            message=f"成功解析文档: {file.filename}"
            + (" 并已存储到向量库" if statistics.get("stored_to_vector") else ""),
            chunks=_convert_chunks(chunks),
            statistics=statistics,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"解析文档失败: {str(e)}",
        )
    finally:
        # 清理临时文件
        shutil.rmtree(temp_dir, ignore_errors=True)
