"""
RAG 图文混合文档处理系统 - FastAPI 入口

启动命令:
    cd backend
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8010

API 文档:
    - Swagger UI: http://localhost:8010/docs
    - ReDoc: http://localhost:8010/redoc
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.endpoints import chat, documents, knowledge_base, search
from app.config import settings
from app.database import AsyncSessionLocal, init_db
from app.dependencies import app_state
from app.models.knowledge_base import KnowledgeBase
from app.models.schemas import HealthResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    print(f"🚀 启动 {settings.APP_NAME} v{settings.APP_VERSION}")
    print(f"📁 图片输出目录: {settings.IMAGE_OUTPUT_DIR}")
    print(f"📁 数据目录: {settings.DATA_DIR}")

    # 初始化 SQLite（知识库元数据）
    await init_db()
    async with AsyncSessionLocal() as db:
        # 若不存在默认知识库，则创建一个映射到当前默认 collection
        result = await db.execute(
            select(KnowledgeBase).where(
                KnowledgeBase.collection_name == settings.MILVUS_COLLECTION_NAME
            )
        )
        kb = result.scalars().first()
        if kb is None:
            from uuid import uuid4

            # 尽力从 Milvus 同步默认 collection 的实体数（不阻断启动）
            doc_count = 0
            try:
                from pymilvus import Collection

                col = Collection(name=settings.MILVUS_COLLECTION_NAME)
                col.load()
                doc_count = int(getattr(col, "num_entities", 0))
            except Exception:
                doc_count = 0

            kb = KnowledgeBase(
                id=str(uuid4()),
                name="默认知识库",
                description="系统默认知识库",
                collection_name=settings.MILVUS_COLLECTION_NAME,
                document_count=doc_count,
            )
            db.add(kb)
            await db.commit()
            print("✅ 默认知识库已创建")

    # 预初始化解析器
    app_state.init_parser()
    print("✅ 文档解析器已初始化")

    # 预初始化 Milvus、Embedding 和 LLM
    print("🔄 正在初始化向量数据库和 LLM 服务...")
    if app_state.init_milvus():
        print("✅ Milvus + Embedding + LLM 初始化成功")
    else:
        print("⚠️ Milvus 初始化失败，将在首次请求时重试")

    yield

    # 关闭时
    app_state.close()
    print("👋 应用已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
## RAG 图文混合文档处理系统 API

支持的功能：
- 📄 文档解析：支持 Word (.docx)、Markdown (.md)、PDF 格式
- 🖼️ 图片提取：自动提取文档中的图片并关联到文本块
- ✂️ 智能切片：多层次切片策略，支持自定义配置
- 🔍 向量检索：基于 Milvus 的相似度搜索
- 📊 HTML 报告：可视化的检索结果展示
    """,
    lifespan=lifespan,
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(documents.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(knowledge_base.router, prefix="/api")


@app.get(
    "/api/health", response_model=HealthResponse, tags=["系统"], summary="健康检查"
)
async def health_check():
    """
    检查服务健康状态

    返回:
    - status: 服务状态
    - version: 版本号
    - milvus_connected: Milvus 连接状态
    """
    return HealthResponse(
        status="healthy",
        version=settings.APP_VERSION,
        milvus_connected=app_state.is_milvus_connected,
    )


@app.get("/", tags=["系统"], summary="根路径")
async def root():
    """API 欢迎页"""
    return {
        "message": f"欢迎使用 {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "redoc": "/redoc",
    }


@app.get("/api/images/{image_path:path}", tags=["图片"], summary="获取图片")
async def get_image(image_path: str):
    """
    获取提取的图片文件

    - **image_path**: 图片文件路径（可以是绝对路径或相对于 extracted_images 的路径）
    """
    # 尝试直接作为绝对路径
    file_path = Path(image_path)

    # 如果不是绝对路径，尝试在 extracted_images 目录下查找
    if not file_path.is_absolute():
        file_path = settings.IMAGE_OUTPUT_DIR / image_path

    # 验证文件存在
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"图片不存在: {image_path}")

    # 验证是图片文件
    allowed_extensions = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
    if file_path.suffix.lower() not in allowed_extensions:
        raise HTTPException(status_code=400, detail="不支持的图片格式")

    return FileResponse(file_path)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8010,
        reload=settings.DEBUG,
    )
