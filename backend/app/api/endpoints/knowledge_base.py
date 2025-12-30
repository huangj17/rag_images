"""知识库管理 API

提供知识库（Milvus collection 的元数据）CRUD。
"""

from __future__ import annotations

import re
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.knowledge_base import KnowledgeBase
from app.models.schemas import (
    KnowledgeBaseCreateRequest,
    KnowledgeBaseListResponse,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdateRequest,
)

router = APIRouter(prefix="/knowledge-bases", tags=["知识库"])


def _to_response(kb: KnowledgeBase) -> KnowledgeBaseResponse:
    return KnowledgeBaseResponse(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        collection_name=kb.collection_name,
        document_count=kb.document_count,
        created_at=kb.created_at,
        updated_at=kb.updated_at,
    )


def _try_sync_count_from_milvus(kb: KnowledgeBase) -> int | None:
    """
    尽力从 Milvus 获取 collection 的 num_entities。
    - 返回 int 表示读取成功
    - 返回 None 表示无法读取（不阻断接口）
    """
    try:
        from pymilvus import Collection, connections, db

        # 如果没有连接，尝试建立默认连接（与 settings 保持一致）
        if not connections.has_connection("default"):
            connections.connect(host=settings.MILVUS_HOST, port=settings.MILVUS_PORT)

        # 确保使用目标数据库（否则可能出现 database not found）
        try:
            db.using_database(settings.MILVUS_DB_NAME)
        except Exception:
            # 尽力而为：数据库不存在/权限问题时不阻断列表
            return None

        col = Collection(name=kb.collection_name)
        col.load()
        return int(getattr(col, "num_entities", 0))
    except Exception:
        return None


@router.get("", response_model=KnowledgeBaseListResponse, summary="获取知识库列表")
async def list_knowledge_bases(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeBase).order_by(KnowledgeBase.created_at.desc())
    )
    items = result.scalars().all()

    # 关键点：不要在 commit() 之后再访问 ORM 字段（可能触发懒加载导致 MissingGreenlet）。
    # 做法：先构造响应（用 Milvus 统计覆盖 document_count），再用显式 UPDATE 同步到 SQLite。
    responses: list[KnowledgeBaseResponse] = []
    updates_to_apply: list[tuple[str, int]] = []

    for kb in items:
        count = _try_sync_count_from_milvus(kb)
        effective_count = count if count is not None else kb.document_count

        responses.append(
            KnowledgeBaseResponse(
                id=kb.id,
                name=kb.name,
                description=kb.description,
                collection_name=kb.collection_name,
                document_count=effective_count,
                created_at=kb.created_at,
                updated_at=kb.updated_at,
            )
        )

        if count is not None and kb.document_count != count:
            updates_to_apply.append((kb.id, count))

    if updates_to_apply:
        try:
            for kb_id, new_count in updates_to_apply:
                await db.execute(
                    update(KnowledgeBase)
                    .where(KnowledgeBase.id == kb_id)
                    .values(document_count=new_count)
                )
            await db.commit()
        except Exception:
            await db.rollback()

    return KnowledgeBaseListResponse(success=True, items=responses)


@router.post(
    "",
    response_model=KnowledgeBaseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建知识库",
)
async def create_knowledge_base(
    request: KnowledgeBaseCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    kb = KnowledgeBase(
        id=str(uuid4()),
        name=request.name.strip(),
        description=request.description,
        collection_name=request.collection_name.strip(),
        document_count=0,
    )

    if not kb.name:
        raise HTTPException(status_code=400, detail="知识库名称不能为空")
    if not kb.collection_name:
        raise HTTPException(status_code=400, detail="collection_name 不能为空")
    if not re.fullmatch(r"[A-Za-z0-9_]+", kb.collection_name):
        raise HTTPException(
            status_code=400,
            detail="collection_name 不合法：仅允许字母/数字/下划线（不允许 '-'）",
        )

    db.add(kb)
    try:
        # 尽力初始化计数为 Milvus 现有实体数（若 collection 已存在）
        count = _try_sync_count_from_milvus(kb)
        if count is not None:
            kb.document_count = count
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="知识库名称或 collection_name 已存在",
        )

    await db.refresh(kb)
    return _to_response(kb)


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse, summary="获取知识库详情")
async def get_knowledge_base(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在")
    return _to_response(kb)


@router.put("/{kb_id}", response_model=KnowledgeBaseResponse, summary="更新知识库")
async def update_knowledge_base(
    kb_id: str,
    request: KnowledgeBaseUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    kb = await db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在")

    if request.name is not None:
        name = request.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="知识库名称不能为空")
        kb.name = name

    if request.description is not None:
        kb.description = request.description

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="知识库名称已存在",
        )

    await db.refresh(kb)
    return _to_response(kb)


@router.delete("/{kb_id}", summary="删除知识库")
async def delete_knowledge_base(kb_id: str, db: AsyncSession = Depends(get_db)):
    kb = await db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在")

    # 尝试删除 Milvus collection（失败不阻断删除元数据）
    try:
        from pymilvus import db as milvus_db
        from pymilvus import utility

        try:
            milvus_db.using_database(settings.MILVUS_DB_NAME)
        except Exception:
            pass

        if utility.has_collection(kb.collection_name):
            utility.drop_collection(kb.collection_name)
    except Exception:
        pass

    await db.delete(kb)
    await db.commit()

    return {"success": True}
