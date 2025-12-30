"""
RAG Chat 服务

功能：
1. 基于 LangGraph 的 RAG 工作流
2. 支持流式输出
3. 支持多轮对话
4. 文档相关性评估和问题重写
"""

import logging
import re
from typing import Any, AsyncGenerator, Dict, List

from app.models.schemas import ChatMessage, ChatSourceDocument

logger = logging.getLogger(__name__)

# 简单问候语模式（不走 RAG，但调用 LLM 回答）
GREETING_PATTERNS = [
    r"^你好[啊吗]?[!！。？?]*$",
    r"^[hH]i[!！。]*$",
    r"^[hH]ello[!！。]*$",
    r"^早上好[!！。]*$",
    r"^下午好[!！。]*$",
    r"^晚上好[!！。]*$",
    r"^嗨[!！。]*$",
    r"^谢谢[你您]?[!！。]*$",
    r"^[tT]hanks?[!！。]*$",
    r"^好的[!！。]*$",
    r"^OK[!！。]*$",
    r"^知道了[!！。]*$",
]

# 简单对话的 Prompt 模板（不需要 RAG 上下文）
SIMPLE_CHAT_PROMPT_TEMPLATE = (
    "你是一个友好的智能问答助手，可以帮助用户查询文档中的相关信息。\n"
    "请对用户的简单问候或日常对话进行自然、友好的回复。\n"
    "回复要简洁、亲切，并适当引导用户进行文档相关的问答。\n\n"
    "用户消息：{query}\n\n"
    "回复："
)

# 高置信度阈值（跳过 LLM 评估）
HIGH_CONFIDENCE_THRESHOLD = 0.75


# Prompt 模板
GRADE_PROMPT_TEMPLATE = (
    "你是一名评审员，需要判断检索到的文档与用户问题的相关性。\n\n"
    "检索到的文档：\n{context}\n\n"
    "用户问题：{question}\n\n"
    "请判断文档是否与问题相关。如果文档包含与问题相关的关键词或语义信息，判定为相关。\n"
    "只需回答 'yes' 或 'no'，不要有其他内容。"
)

REWRITE_PROMPT_TEMPLATE = (
    "请审视输入内容，并尽量推理其潜在的语义意图。\n"
    "这是最初的问题："
    "\n ------- \n"
    "{question}"
    "\n ------- \n"
    "请将其改写为更优的问题，只输出改写后的问题，不要有其他内容："
)

GENERATE_PROMPT_TEMPLATE = (
    "你是一名专业的问答助手。请利用以下检索到的上下文片段来回答问题。\n"
    "如果上下文中没有相关信息，就直接说你不知道，不要编造答案。\n"
    "回答要详细、准确，并尽可能引用原文内容。\n\n"
    "【重要】上下文中可能包含图片引用，格式为 [IMG:图片路径]。\n"
    "当图片与回答内容相关时，请在回答的适当位置保留这些图片引用（原样输出 [IMG:...] 格式）。\n"
    "图片引用可以帮助用户更好地理解内容，请合理使用。\n\n"
    "上下文：\n{context}\n\n"
    "问题：{question}\n\n"
    "回答："
)

HISTORY_CONTEXT_TEMPLATE = (
    "以下是之前的对话历史，请结合历史上下文理解当前问题：\n\n"
    "{history}\n\n"
    "当前问题：{question}"
)


class ChatService:
    """RAG Chat 服务"""

    def __init__(self, milvus_client, rag_store):
        """
        初始化 Chat 服务

        Args:
            milvus_client: MilvusClient 实例
            rag_store: RAGImageStore 实例
        """
        self.milvus_client = milvus_client
        self.rag_store = rag_store
        self.max_rewrite_attempts = 1  # 最大重写次数（减少为1次）
        self._greeting_patterns = [
            re.compile(p, re.IGNORECASE) for p in GREETING_PATTERNS
        ]

    def _is_greeting(self, query: str) -> bool:
        """
        检测是否是简单问候语

        Returns:
            是否是问候语
        """
        query = query.strip()
        for pattern in self._greeting_patterns:
            if pattern.match(query):
                return True
        return False

    def _format_history(self, history: List[ChatMessage]) -> str:
        """格式化对话历史"""
        if not history:
            return ""

        formatted = []
        for msg in history[-6:]:  # 只保留最近 6 条消息
            role_name = "用户" if msg.role == "user" else "助手"
            formatted.append(f"{role_name}：{msg.content}")

        return "\n".join(formatted)

    def _enhance_query_with_history(
        self, query: str, history: List[ChatMessage]
    ) -> str:
        """结合历史上下文增强查询"""
        if not history:
            return query

        # 使用 LLM 改写查询，融入历史上下文
        history_text = self._format_history(history)
        return HISTORY_CONTEXT_TEMPLATE.format(history=history_text, question=query)

    def _search_documents(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """检索相关文档"""
        try:
            results = self.rag_store.search(query=query, top_k=top_k)
            return results
        except Exception as e:
            logger.error(f"检索失败: {e}")
            return []

    def _grade_documents(
        self, question: str, context: str, avg_score: float = 0.0
    ) -> bool:
        """
        评估文档相关性

        优化：如果检索结果的平均相似度分数高于阈值，跳过 LLM 评估
        """
        # 高置信度时跳过 LLM 评估
        if avg_score >= HIGH_CONFIDENCE_THRESHOLD:
            logger.info(f"高置信度检索 (score={avg_score:.3f})，跳过 LLM 评估")
            return True

        if not self.milvus_client.llm:
            return True  # 如果没有 LLM，默认相关

        try:
            prompt = GRADE_PROMPT_TEMPLATE.format(question=question, context=context)
            response = self.milvus_client.llm.invoke(
                [{"role": "user", "content": prompt}]
            )
            score = response.content.strip().lower()
            return "yes" in score
        except Exception as e:
            logger.error(f"文档评估失败: {e}")
            return True  # 出错时默认相关

    def _get_avg_score(self, results: List[Dict[str, Any]]) -> float:
        """计算检索结果的平均相似度分数"""
        if not results:
            return 0.0
        scores = [r.get("score", 0.0) for r in results]
        return sum(scores) / len(scores)

    def _rewrite_question(self, question: str) -> str:
        """重写问题"""
        if not self.milvus_client.llm:
            return question

        try:
            prompt = REWRITE_PROMPT_TEMPLATE.format(question=question)
            response = self.milvus_client.llm.invoke(
                [{"role": "user", "content": prompt}]
            )
            return response.content.strip()
        except Exception as e:
            logger.error(f"问题重写失败: {e}")
            return question

    def _format_context(self, results: List[Dict[str, Any]]) -> str:
        """格式化检索结果为上下文"""
        if not results:
            return ""

        context_parts = []
        for i, r in enumerate(results, 1):
            source = r.get("source_file", "未知来源")
            section = r.get("section", "未知章节")
            text = r.get("text", "")
            context_parts.append(f"[{i}] 来源：{source} - {section}\n{text}")

        return "\n\n".join(context_parts)

    def _convert_to_sources(
        self, results: List[Dict[str, Any]]
    ) -> List[ChatSourceDocument]:
        """转换检索结果为源文档列表"""
        sources = []
        for r in results:
            sources.append(
                ChatSourceDocument(
                    chunk_id=r.get("chunk_id", ""),
                    text=r.get("text", "")[:200] + "..."
                    if len(r.get("text", "")) > 200
                    else r.get("text", ""),
                    source_file=r.get("source_file", ""),
                    section=r.get("section", ""),
                    score=r.get("score", 0.0),
                )
            )
        return sources

    def _generate_fallback_answer(
        self, query: str, results: List[Dict[str, Any]]
    ) -> str:
        """
        当 LLM 不可用时，生成基于检索结果的回退答案
        """
        if not results:
            return "抱歉，没有找到相关内容。"

        answer_parts = [
            "⚠️ LLM 服务暂时不可用，以下是根据您的问题检索到的相关文档内容：\n"
        ]

        for i, r in enumerate(results[:3], 1):  # 只显示前 3 个结果
            section = r.get("section", "未知章节")
            text = r.get("text", "")[:500]  # 限制长度
            answer_parts.append(f"\n**[{i}] {section}**\n{text}\n")

        answer_parts.append("\n---\n请稍后重试，或查看上方的参考来源获取更多信息。")

        return "".join(answer_parts)

    async def chat_stream(
        self,
        query: str,
        history: List[ChatMessage],
        top_k: int = 5,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        流式问答

        Args:
            query: 用户问题
            history: 对话历史
            top_k: 检索文档数量

        Yields:
            流式事件
        """
        # 1. 发送开始事件
        yield {"event": "start", "data": None}

        try:
            # 简单问候语：不走 RAG，直接调用 LLM 回答
            if self._is_greeting(query):
                if not self.milvus_client.llm:
                    yield {
                        "event": "token",
                        "data": "您好！我是智能问答助手，有什么可以帮助您的？",
                    }
                    yield {"event": "end", "data": None}
                    return

                prompt = SIMPLE_CHAT_PROMPT_TEMPLATE.format(query=query)
                try:
                    async for chunk in self.milvus_client.llm.astream(
                        [{"role": "user", "content": prompt}]
                    ):
                        if hasattr(chunk, "content") and chunk.content:
                            yield {"event": "token", "data": chunk.content}
                except Exception as e:
                    logger.warning(f"简单问答流式输出失败，尝试非流式: {e}")
                    try:
                        response = self.milvus_client.llm.invoke(
                            [{"role": "user", "content": prompt}]
                        )
                        yield {"event": "token", "data": response.content}
                    except Exception as invoke_error:
                        logger.error(f"简单问答调用 LLM 失败: {invoke_error}")
                        yield {
                            "event": "token",
                            "data": "您好！我是智能问答助手，有什么可以帮助您的？",
                        }

                yield {"event": "end", "data": None}
                return

            # 2. 结合历史增强查询
            enhanced_query = query
            if history:
                enhanced_query = self._enhance_query_with_history(query, history)

            # 3. 检索文档
            results = self._search_documents(enhanced_query, top_k)

            # 如果没有检索到文档
            if not results:
                yield {
                    "event": "token",
                    "data": "抱歉，没有找到相关的文档内容。请尝试换一种方式提问。",
                }
                yield {"event": "end", "data": None}
                return

            # 4. 评估文档相关性（基于相似度分数优化）
            context = self._format_context(results)
            avg_score = self._get_avg_score(results)
            is_relevant = self._grade_documents(query, context, avg_score)

            # 5. 如果不相关，尝试重写问题（已优化为最多1次）
            rewrite_count = 0
            while not is_relevant and rewrite_count < self.max_rewrite_attempts:
                rewrite_count += 1
                rewritten_query = self._rewrite_question(query)
                logger.info(f"问题重写 #{rewrite_count}: {query} -> {rewritten_query}")

                # 重新检索
                results = self._search_documents(rewritten_query, top_k)
                if results:
                    context = self._format_context(results)
                    avg_score = self._get_avg_score(results)
                    is_relevant = self._grade_documents(
                        rewritten_query, context, avg_score
                    )

            # 6. 发送源文档信息
            sources = self._convert_to_sources(results)
            yield {"event": "sources", "sources": [s.model_dump() for s in sources]}

            # 7. 生成回答（流式）
            if not self.milvus_client.llm:
                yield {"event": "token", "data": "LLM 服务未初始化，无法生成回答。"}
                yield {"event": "end", "data": None}
                return

            prompt = GENERATE_PROMPT_TEMPLATE.format(context=context, question=query)

            # 使用流式输出
            generated_content = False
            try:
                async for chunk in self.milvus_client.llm.astream(
                    [{"role": "user", "content": prompt}]
                ):
                    if hasattr(chunk, "content") and chunk.content:
                        yield {"event": "token", "data": chunk.content}
                        generated_content = True
            except Exception as stream_error:
                # 如果流式失败，尝试非流式
                logger.warning(f"流式输出失败，尝试非流式: {stream_error}")
                try:
                    response = self.milvus_client.llm.invoke(
                        [{"role": "user", "content": prompt}]
                    )
                    yield {"event": "token", "data": response.content}
                    generated_content = True
                except Exception as invoke_error:
                    logger.error(f"非流式输出也失败: {invoke_error}")
                    # 如果 LLM 完全失败，返回基于检索结果的简单回答
                    fallback_answer = self._generate_fallback_answer(query, results)
                    yield {"event": "token", "data": fallback_answer}
                    generated_content = True

            # 如果没有生成任何内容，发送回退答案
            if not generated_content:
                fallback_answer = self._generate_fallback_answer(query, results)
                yield {"event": "token", "data": fallback_answer}

            # 8. 发送结束事件
            yield {"event": "end", "data": None}

        except Exception as e:
            logger.error(f"Chat 服务错误: {e}")
            yield {"event": "error", "message": str(e)}
            yield {"event": "end", "data": None}

    def chat_sync(
        self,
        query: str,
        history: List[ChatMessage],
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """
        同步问答（非流式）

        Args:
            query: 用户问题
            history: 对话历史
            top_k: 检索文档数量

        Returns:
            包含回答和源文档的字典
        """
        try:
            # 简单问候语：不走 RAG，直接调用 LLM 回答
            if self._is_greeting(query):
                if not self.milvus_client.llm:
                    return {
                        "answer": "您好！我是智能问答助手，有什么可以帮助您的？",
                        "sources": [],
                    }

                prompt = SIMPLE_CHAT_PROMPT_TEMPLATE.format(query=query)
                try:
                    response = self.milvus_client.llm.invoke(
                        [{"role": "user", "content": prompt}]
                    )
                    return {"answer": response.content, "sources": []}
                except Exception as e:
                    logger.error(f"简单问答调用 LLM 失败: {e}")
                    return {
                        "answer": "您好！我是智能问答助手，有什么可以帮助您的？",
                        "sources": [],
                    }

            # 结合历史增强查询
            enhanced_query = query
            if history:
                enhanced_query = self._enhance_query_with_history(query, history)

            # 检索文档
            results = self._search_documents(enhanced_query, top_k)

            if not results:
                return {
                    "answer": "抱歉，没有找到相关的文档内容。请尝试换一种方式提问。",
                    "sources": [],
                }

            # 评估和重写（带相似度优化）
            context = self._format_context(results)
            avg_score = self._get_avg_score(results)
            is_relevant = self._grade_documents(query, context, avg_score)

            rewrite_count = 0
            while not is_relevant and rewrite_count < self.max_rewrite_attempts:
                rewrite_count += 1
                rewritten_query = self._rewrite_question(query)
                results = self._search_documents(rewritten_query, top_k)
                if results:
                    context = self._format_context(results)
                    avg_score = self._get_avg_score(results)
                    is_relevant = self._grade_documents(
                        rewritten_query, context, avg_score
                    )

            # 生成回答
            sources = self._convert_to_sources(results)

            if not self.milvus_client.llm:
                return {
                    "answer": "LLM 服务未初始化，无法生成回答。",
                    "sources": [s.model_dump() for s in sources],
                }

            prompt = GENERATE_PROMPT_TEMPLATE.format(context=context, question=query)
            response = self.milvus_client.llm.invoke(
                [{"role": "user", "content": prompt}]
            )

            return {
                "answer": response.content,
                "sources": [s.model_dump() for s in sources],
            }

        except Exception as e:
            logger.error(f"Chat 服务错误: {e}")
            return {
                "answer": f"生成回答时出错：{str(e)}",
                "sources": [],
            }
