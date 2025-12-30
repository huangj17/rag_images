"""
RAG 存储服务

功能：
1. 文档块索引到 Milvus
2. 相似度搜索
3. HTML 报告导出
"""

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from .document_parser import DocumentChunk


class RAGImageStore:
    """RAG 图文存储管理"""

    def __init__(self, milvus_util, collection_name: str = "doc_image_chunks"):
        """
        初始化存储

        Args:
            milvus_util: MilvusUtil 实例
            collection_name: 集合名称
        """
        self.milvus_util = milvus_util
        self.collection_name = collection_name

    def delete_by_source_file(self, source_file: str) -> int:
        """
        根据源文件名删除相关的所有 chunks（使用文件名匹配，忽略路径）

        Args:
            source_file: 源文件路径

        Returns:
            删除的记录数量
        """
        import os

        # 提取文件名（忽略临时目录路径差异）
        filename = os.path.basename(source_file)
        print(f"🔍 准备删除文件名匹配的记录: {filename}")

        try:
            if not self.milvus_util.vector_store:
                print("⚠️  向量存储未初始化")
                return 0

            # 获取实际的 collection 名称
            actual_collection_name = self.milvus_util.collection_name
            print(f"🔍 Collection: {actual_collection_name}")

            from pymilvus import Collection
            from pymilvus.exceptions import SchemaNotReadyException

            try:
                collection = Collection(name=actual_collection_name)
                collection.load()
            except SchemaNotReadyException:
                # 新集合首次入库前可能不存在，视为无需删除旧记录
                if self.milvus_util.verbose:
                    print(
                        f"ℹ️  Collection 不存在，跳过删除旧记录: {actual_collection_name}"
                    )
                return 0

            # 查看 schema 结构
            schema = collection.schema
            field_names = [field.name for field in schema.fields]

            # 获取主键字段名
            pk_field = None
            for field in schema.fields:
                if field.is_primary:
                    pk_field = field.name
                    break

            if not pk_field:
                print("⚠️  未找到主键字段")
                return 0

            # 使用 like 表达式按文件名匹配（路径以文件名结尾）
            if "source_file" in field_names:
                # 使用 like 匹配文件名
                expr = f'source_file like "%{filename}"'
                print(f"🔍 使用表达式删除: {expr}")

                result = collection.delete(expr)
                deleted_count = (
                    result.delete_count if hasattr(result, "delete_count") else 0
                )

                if deleted_count > 0:
                    print(f"🗑️  已删除文件 [{filename}] 的 {deleted_count} 条旧记录")
                    return deleted_count

            # 备用方案：通过搜索查找并删除
            print("🔍 尝试通过搜索查找匹配记录...")
            deleted_count = self._delete_by_filename_search(
                collection, pk_field, filename
            )

            if deleted_count > 0:
                print(f"🗑️  已删除文件 [{filename}] 的 {deleted_count} 条旧记录")
            else:
                print(f"ℹ️  未找到文件 [{filename}] 的旧记录")

            return deleted_count

        except Exception as e:
            print(f"⚠️  删除旧记录失败: {e}")
            import traceback

            traceback.print_exc()
            return 0

    def _delete_by_filename_search(
        self, collection, pk_field: str, filename: str
    ) -> int:
        """
        通过搜索查找文件名匹配的记录并删除
        """
        import os

        try:
            if not self.milvus_util.vector_store:
                return 0

            # 获取较多结果来确保覆盖
            results = self.milvus_util.vector_store.similarity_search(
                query="test",  # 需要一个有效的查询
                k=10000,
            )

            # 过滤出匹配文件名的文档
            ids_to_delete = []
            for doc in results:
                doc_source = doc.metadata.get("source_file", "")
                doc_filename = os.path.basename(doc_source)
                if doc_filename == filename:
                    chunk_id = doc.metadata.get("chunk_id")
                    if chunk_id:
                        ids_to_delete.append(chunk_id)

            if ids_to_delete:
                print(f"🔍 通过搜索找到 {len(ids_to_delete)} 条待删除记录")
                # 构建删除表达式
                ids_str = ", ".join([f'"{id}"' for id in ids_to_delete])
                expr = f"{pk_field} in [{ids_str}]"
                result = collection.delete(expr)
                deleted_count = (
                    result.delete_count
                    if hasattr(result, "delete_count")
                    else len(ids_to_delete)
                )
                return deleted_count

            return 0
        except Exception as e:
            print(f"⚠️  搜索删除方法失败: {e}")
            import traceback

            traceback.print_exc()
            return 0

    def index_chunks(
        self, chunks: List[DocumentChunk], replace_existing: bool = True
    ) -> bool:
        """
        索引文档块到向量数据库

        Args:
            chunks: 文档块列表
            replace_existing: 是否替换同一文件的已有数据（默认 True，避免重复）

        Returns:
            是否成功
        """
        from langchain_core.documents import Document

        if not chunks:
            print("⚠️  没有要索引的文档块")
            return True

        # 如果需要替换已有数据，先删除同一文件的旧数据
        if replace_existing:
            source_files = set(chunk.source_file for chunk in chunks)
            for source_file in source_files:
                self.delete_by_source_file(source_file)

        documents = []
        ids = []
        for chunk in chunks:
            doc = Document(
                page_content=chunk.text,
                metadata={
                    "chunk_id": chunk.chunk_id,
                    "source_file": chunk.source_file,
                    "section": chunk.section,
                    "page_number": chunk.page_number,
                    "images": json.dumps(chunk.images),
                    "has_images": chunk.metadata.get("has_images", False),
                    "image_count": chunk.metadata.get("image_count", 0),
                    "text_length": chunk.metadata.get("text_length", 0),
                },
            )
            documents.append(doc)
            ids.append(chunk.chunk_id)

        try:
            self.milvus_util.vector_store.add_documents(documents=documents, ids=ids)
            # 显式 flush，确保 num_entities/检索可用（避免“写入成功但查询不到”）
            try:
                from pymilvus import Collection
                from pymilvus import db as milvus_db

                try:
                    milvus_db.using_database(settings.MILVUS_DB_NAME)
                except Exception:
                    pass

                col = Collection(name=self.milvus_util.collection_name)
                col.flush()
            except Exception:
                # flush 失败不阻断主流程，但可能导致短时间内统计/检索不可见
                pass
            if self.milvus_util.verbose:
                print(f"✅ 成功索引 {len(documents)} 个文档块")
            return True
        except Exception as e:
            print(f"❌ 索引失败: {e}")
            return False

    def search(
        self,
        query: str,
        top_k: int = 5,
        with_images_only: bool = False,
    ) -> List[Dict[str, Any]]:
        """搜索相关文档块"""
        if not self.milvus_util.vector_store:
            print("❌ 向量存储未初始化")
            return []

        try:
            results = self.milvus_util.vector_store.similarity_search_with_score(
                query, k=top_k
            )
        except Exception as e:
            print(f"❌ 搜索失败: {e}")
            return []

        parsed_results = []
        for doc, score in results:
            if with_images_only and not doc.metadata.get("has_images", False):
                continue

            images = []
            if doc.metadata.get("images"):
                try:
                    images = json.loads(doc.metadata["images"])
                except json.JSONDecodeError:
                    images = []

            parsed_results.append(
                {
                    "chunk_id": doc.metadata.get("chunk_id", ""),
                    "text": doc.page_content,
                    "source_file": doc.metadata.get("source_file", ""),
                    "section": doc.metadata.get("section", ""),
                    "images": images,
                    "page_number": doc.metadata.get("page_number", 0),
                    "score": score,
                    "text_length": doc.metadata.get("text_length", 0),
                }
            )

        return parsed_results


def export_results_to_html(
    results: List[Dict[str, Any]],
    query: str,
    output_path: str = "search_results.html",
    auto_open: bool = False,
) -> str:
    """
    将检索结果导出为 HTML 文件，支持图片展示

    Args:
        results: 检索结果列表
        query: 查询文本
        output_path: 输出文件路径
        auto_open: 是否自动打开浏览器

    Returns:
        输出文件的绝对路径
    """
    html_content = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RAG 检索结果 - {query}</title>
    <style>
        * {{ box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f7fa;
            color: #333;
        }}
        h1 {{
            color: #1a73e8;
            border-bottom: 3px solid #1a73e8;
            padding-bottom: 10px;
        }}
        .query-box {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 25px;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }}
        .query-box .label {{ opacity: 0.8; font-size: 14px; }}
        .query-box .query-text {{ font-size: 20px; font-weight: bold; margin-top: 5px; }}
        .meta-info {{
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            gap: 30px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
        .meta-item {{ display: flex; align-items: center; gap: 8px; }}
        .meta-item .icon {{ font-size: 20px; }}
        .result-card {{
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin: 15px 0;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
            transition: transform 0.2s, box-shadow 0.2s;
        }}
        .result-card:hover {{
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.12);
        }}
        .result-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
        }}
        .result-rank {{
            background: #1a73e8;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }}
        .score {{
            background: #e8f5e9;
            color: #2e7d32;
            padding: 5px 12px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 14px;
        }}
        .result-meta {{
            display: flex;
            gap: 20px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }}
        .result-meta span {{
            background: #f0f4f8;
            padding: 5px 10px;
            border-radius: 6px;
            font-size: 13px;
            color: #555;
        }}
        .result-text {{
            background: #fafafa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #1a73e8;
            line-height: 1.8;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: none;
            overflow-y: visible;
        }}
        .inline-image {{
            margin: 15px 0;
            padding: 15px;
            background: #f0f4f8;
            border-radius: 12px;
            text-align: center;
        }}
        .inline-image img {{
            max-width: 100%;
            max-height: 500px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }}
        .inline-image img:hover {{
            transform: scale(1.01);
            box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        }}
        .images-section {{
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px dashed #ddd;
        }}
        .images-section h4 {{
            margin: 0 0 10px 0;
            color: #666;
            font-size: 14px;
        }}
        .images-grid {{
            display: flex;
            flex-direction: column;
            gap: 20px;
        }}
        .image-container {{
            position: relative;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0,0,0,0.15);
            background: #f8f9fa;
            padding: 10px;
        }}
        .image-container img {{
            width: 100%;
            max-width: 800px;
            height: auto;
            display: block;
            cursor: pointer;
            transition: transform 0.3s;
            border-radius: 8px;
            margin: 0 auto;
        }}
        .image-container img:hover {{
            transform: scale(1.01);
            box-shadow: 0 6px 20px rgba(0,0,0,0.2);
        }}
        .image-name {{
            text-align: center;
            background: #e9ecef;
            color: #495057;
            padding: 8px 12px;
            font-size: 13px;
            margin-top: 10px;
            border-radius: 6px;
            word-break: break-all;
        }}
        .no-images {{
            color: #999;
            font-style: italic;
            padding: 10px;
            text-align: center;
            background: #f9f9f9;
            border-radius: 8px;
        }}
        .footer {{
            text-align: center;
            color: #999;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            font-size: 13px;
        }}
        .lightbox {{
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 1000;
            justify-content: center;
            align-items: center;
        }}
        .lightbox img {{
            max-width: 90%;
            max-height: 90%;
            border-radius: 8px;
        }}
        .lightbox-close {{
            position: absolute;
            top: 20px;
            right: 30px;
            color: white;
            font-size: 40px;
            cursor: pointer;
        }}
    </style>
</head>
<body>
    <h1>🔍 RAG 图文检索结果</h1>

    <div class="query-box">
        <div class="label">查询内容</div>
        <div class="query-text">{query}</div>
    </div>

    <div class="meta-info">
        <div class="meta-item">
            <span class="icon">📊</span>
            <span>返回 {len(results)} 条结果</span>
        </div>
        <div class="meta-item">
            <span class="icon">🕐</span>
            <span>生成时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</span>
        </div>
    </div>
"""

    # 生成每个结果卡片
    for i, result in enumerate(results):
        raw_text = result.get("text", "")
        has_inline_images = "[IMG:" in raw_text
        inline_image_count = raw_text.count("[IMG:")

        images_html = ""
        images = result.get("images", [])

        if images and not has_inline_images:
            images_html = '<div class="images-section"><h4>🖼️ 关联图片</h4><div class="images-grid">'
            for img_path in images:
                abs_img_path = os.path.abspath(img_path)
                img_name = os.path.basename(img_path)
                images_html += f'''
                <div class="image-container">
                    <img src="file://{abs_img_path}" alt="{img_name}" onclick="openLightbox(this.src)">
                    <div class="image-name">{img_name}</div>
                </div>
                '''
            images_html += "</div></div>"

        def replace_img_placeholder(match):
            img_path = match.group(1)
            abs_path = os.path.abspath(img_path)
            img_name = os.path.basename(img_path)
            return f'''<div class="inline-image">
                <img src="file://{abs_path}" alt="{img_name}" onclick="openLightbox(this.src)">
            </div>'''

        text_content = raw_text.replace("<", "&lt;").replace(">", "&gt;")
        text_content = re.sub(r"&lt;IMG:([^&]+)&gt;", r"[IMG:\1]", text_content)
        text_content = re.sub(
            r"\[IMG:([^\]]+)\]", replace_img_placeholder, text_content
        )

        if has_inline_images:
            image_info = f"{inline_image_count} 张"
        elif images:
            image_info = f"{len(images)} 张"
        else:
            image_info = "0 张"

        html_content += f"""
    <div class="result-card">
        <div class="result-header">
            <div style="display: flex; align-items: center; gap: 15px;">
                <div class="result-rank">{i + 1}</div>
                <span style="font-size: 18px; font-weight: 500;">结果 #{i + 1}</span>
            </div>
            <div class="score">相似度: {result.get("score", 0):.4f}</div>
        </div>

        <div class="result-meta">
            <span>📌 章节: {result.get("section", "未知")}</span>
            <span>📄 来源: {os.path.basename(result.get("source_file", "未知"))}</span>
            <span>📏 长度: {result.get("text_length", len(raw_text))} 字符</span>
            <span>🖼️ 图片: {image_info}</span>
        </div>

        <div class="result-text">{text_content}</div>

        {images_html}
    </div>
"""

    html_content += """
    <div class="footer">
        由 RAG 图文混合文档处理系统生成
    </div>

    <div class="lightbox" id="lightbox" onclick="closeLightbox()">
        <span class="lightbox-close">&times;</span>
        <img id="lightbox-img" src="" alt="放大查看">
    </div>

    <script>
        function openLightbox(src) {
            document.getElementById('lightbox-img').src = src;
            document.getElementById('lightbox').style.display = 'flex';
        }
        function closeLightbox() {
            document.getElementById('lightbox').style.display = 'none';
        }
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeLightbox();
        });
    </script>
</body>
</html>
"""

    output_path = os.path.abspath(output_path)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"✅ HTML 报告已保存到: {output_path}")

    if auto_open:
        import webbrowser

        webbrowser.open(f"file://{output_path}")
        print("🌐 已在浏览器中打开")

    return output_path
