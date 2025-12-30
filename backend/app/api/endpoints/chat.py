"""
Chat API 端点

提供基于 RAG 的问答流式接口
"""

import asyncio
import json
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.config import settings
from app.dependencies import app_state, ensure_milvus_connected
from app.models.schemas import ChatRequest

router = APIRouter(tags=["问答对话"])


async def generate_sse_events(
    query: str,
    history: list,
    top_k: int,
    collection_name: str | None,
) -> AsyncGenerator[str, None]:
    """
    生成 SSE 事件流

    Args:
        query: 用户问题
        history: 对话历史
        top_k: 检索文档数量
        collection_name: 集合名称
    """
    # 确保 Milvus 已连接
    target_collection = collection_name or settings.MILVUS_COLLECTION_NAME
    if not ensure_milvus_connected(target_collection):
        yield f"data: {json.dumps({'event': 'error', 'message': '无法连接到 Milvus 数据库'}, ensure_ascii=False)}\n\n"
        return

    chat_service = app_state.chat_service
    if chat_service is None:
        yield f"data: {json.dumps({'event': 'error', 'message': 'Chat 服务未初始化'}, ensure_ascii=False)}\n\n"
        return

    try:
        async for event in chat_service.chat_stream(
            query=query,
            history=history,
            top_k=top_k,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            # 小延迟以确保流式传输正常
            await asyncio.sleep(0.01)
    except Exception as e:
        yield f"data: {json.dumps({'event': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'event': 'end', 'data': None}, ensure_ascii=False)}\n\n"


@router.post("/chat", summary="RAG 问答（流式）")
async def chat_stream(request: ChatRequest):
    """
    基于 RAG 的问答接口，支持流式输出

    - **query**: 用户问题
    - **history**: 对话历史
    - **top_k**: 检索文档数量
    - **collection_name**: 可选的集合名称

    返回 Server-Sent Events (SSE) 流，事件类型：
    - start: 开始生成
    - sources: 返回检索到的源文档
    - token: 生成的文本 token
    - end: 生成完成
    - error: 发生错误
    """
    if not request.query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="查询文本不能为空",
        )

    # 转换历史消息格式
    history = []
    for msg in request.history:
        history.append({"role": msg.role, "content": msg.content})

    return StreamingResponse(
        generate_sse_events(
            query=request.query,
            history=request.history,
            top_k=request.top_k,
            collection_name=request.collection_name,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/sync", summary="RAG 问答（非流式）")
async def chat_sync(request: ChatRequest):
    """
    基于 RAG 的问答接口，非流式输出

    - **query**: 用户问题
    - **history**: 对话历史
    - **top_k**: 检索文档数量
    - **collection_name**: 可选的集合名称

    返回完整的回答和源文档
    """
    if not request.query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="查询文本不能为空",
        )

    # 确保 Milvus 已连接
    target_collection = request.collection_name or settings.MILVUS_COLLECTION_NAME
    if not ensure_milvus_connected(target_collection):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="无法连接到 Milvus 数据库",
        )

    chat_service = app_state.chat_service
    if chat_service is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chat 服务未初始化",
        )

    try:
        result = chat_service.chat_sync(
            query=request.query,
            history=request.history,
            top_k=request.top_k,
        )
        return {
            "success": True,
            "query": request.query,
            "answer": result["answer"],
            "sources": result["sources"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"问答失败: {str(e)}",
        )
