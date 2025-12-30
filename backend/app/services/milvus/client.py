"""
Milvus 数据库客户端

功能：
1. 连接和管理 Milvus 数据库
2. 初始化 Embedding 模型
3. 创建和管理向量存储
4. 文档添加和相似性搜索
5. 集合管理
6. RAG 工作流集成

设计理念：
- 封装为工具类，便于 RAG 系统集成
- 使用统一配置管理（app.config）
- 自动管理连接和资源
- 提供清晰的 API 接口
"""

import logging
import os
from typing import Any, Dict, List, Literal, Optional

from IPython.display import Image, display
from langchain_classic.tools.retriever import create_retriever_tool
from langchain_milvus import Milvus
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from pymilvus import Collection, MilvusException, connections, db, utility

from app.config import settings

# ==================== Prompt 模板 ====================

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
    "请将其改写为更优的问题："
)

GENERATE_PROMPT_TEMPLATE = (
    "你是一名问答助手。请利用以下检索到的上下文片段来回答问题。"
    "如果你不知道答案，就直接说你不知道。"
    "答案回复尽量详细，不要过于简洁。\n"
    "问题: {question} \n"
    "上下文: {context}"
)

# 配置日志
logger = logging.getLogger(__name__)


class MilvusClient:
    """
    Milvus 数据库客户端，用于 RAG 系统的向量存储

    主要功能：
    - 数据库连接管理
    - 向量存储和检索
    - RAG 工作流集成
    - 文档管理和搜索
    """

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        db_name: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_base_url: Optional[str] = None,
        llm_model: Optional[str] = None,
        llm_base_url: Optional[str] = None,
        collection_name: Optional[str] = None,
        drop_old: bool = False,
        verbose: bool = False,
    ):
        """
        初始化 Milvus 客户端

        所有参数均可选，默认使用 app.config 中的配置

        Args:
            host: Milvus 服务器地址
            port: Milvus 服务器端口
            db_name: 数据库名称
            embedding_model: Embedding 模型名称
            embedding_base_url: Embedding 服务地址
            llm_model: LLM 模型名称
            llm_base_url: LLM 服务地址
            collection_name: 集合名称
            drop_old: 是否删除已存在的集合
            verbose: 是否输出详细日志
        """
        # 数据库配置（使用传入值或配置默认值）
        self.host = host or settings.MILVUS_HOST
        self.port = port or settings.MILVUS_PORT
        self.db_name = db_name or settings.MILVUS_DB_NAME

        # Embedding 配置
        self.embedding_model = embedding_model or settings.EMBEDDING_MODEL
        self.embedding_base_url = embedding_base_url or settings.EMBEDDING_BASE_URL

        # LLM 配置
        self.llm_model = llm_model or settings.LLM_MODEL
        self.llm_base_url = llm_base_url or settings.LLM_BASE_URL

        # 集合配置
        self.collection_name = collection_name or settings.MILVUS_COLLECTION_NAME
        self.drop_old = drop_old

        # 运行时配置
        self.verbose = verbose

        # 内部状态
        self._connected = False
        self.embeddings: Optional[OllamaEmbeddings] = None
        self.vector_store: Optional[Milvus] = None
        self.llm: Optional[ChatOllama] = None
        self.retriever_tool = None

        # 配置日志级别
        if verbose:
            logging.basicConfig(level=logging.INFO)

    # ==================== 连接管理 ====================

    def connect(self) -> bool:
        """连接到 Milvus 数据库"""
        try:
            connections.connect(host=self.host, port=self.port)

            if connections.has_connection("default"):
                self._connected = True
                if self.verbose:
                    logger.info(f"✅ 成功连接到 Milvus: {self.host}:{self.port}")
                return True
            else:
                logger.error("❌ 连接失败: 未建立默认连接")
                return False
        except Exception as e:
            logger.error(f"❌ Milvus 连接失败: {e}")
            return False

    def close(self) -> None:
        """关闭数据库连接"""
        try:
            if self._connected:
                connections.disconnect("default")
                self._connected = False
                if self.verbose:
                    logger.info("✅ 已断开 Milvus 连接")
        except Exception as e:
            logger.error(f"❌ 断开连接失败: {e}")

    # ==================== 数据库管理 ====================

    def setup_database(self) -> bool:
        """设置数据库（存在则复用，不存在则创建）"""
        try:
            existing_databases = db.list_database()

            if self.db_name in existing_databases:
                if self.verbose:
                    logger.info(f"数据库 '{self.db_name}' 已存在，直接使用")
            else:
                db.create_database(self.db_name)
                if self.verbose:
                    logger.info(f"✅ 创建数据库 '{self.db_name}'")

            db.using_database(self.db_name)

            if self.verbose:
                collections = utility.list_collections()
                if collections:
                    logger.info(f"当前数据库中的集合: {collections}")

            return True
        except MilvusException as e:
            logger.error(f"❌ 数据库操作失败: {e}")
            return False

    # ==================== 模型初始化 ====================

    def init_embeddings(self) -> bool:
        """初始化 Embedding 模型"""
        try:
            self.embeddings = OllamaEmbeddings(
                model=self.embedding_model,
                base_url=self.embedding_base_url,
            )

            if self.verbose:
                test_embedding = self.embeddings.embed_query("测试")
                logger.info(
                    f"✅ Embedding 模型初始化成功，向量维度: {len(test_embedding)}"
                )

            return True
        except Exception as e:
            logger.error(f"❌ Embedding 模型初始化失败: {e}")
            return False

    def init_response_model(
        self,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        temperature: Optional[float] = None,
        timeout: int = 120,
    ) -> bool:
        """初始化响应模型（LLM）"""
        try:
            model_name = model or self.llm_model
            service_url = base_url or self.llm_base_url
            temp = temperature or settings.LLM_TEMPERATURE

            self.llm = ChatOllama(
                model=model_name,
                base_url=service_url,
                temperature=temp,
                headers={"Authorization": f"Bearer {os.environ.get('OLLAMA_API_KEY')}"},
                timeout=timeout,  # 添加超时设置
            )

            if self.verbose:
                logger.info(f"✅ LLM 模型初始化成功: {model_name} (timeout={timeout}s)")

            return True
        except Exception as e:
            logger.error(f"❌ 初始化响应模型失败: {e}")
            return False

    # ==================== 向量存储管理 ====================

    def create_vector_store(
        self,
        index_params: Optional[Dict[str, Any]] = None,
        search_params: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """创建向量存储"""
        if not self.embeddings:
            logger.error("❌ 请先初始化 Embedding 模型")
            return False

        try:
            if index_params is None:
                index_params = settings.get_index_params()

            if search_params is None:
                search_params = settings.get_search_params()

            connection_args = settings.get_connection_args()

            kwargs = {
                "embedding_function": self.embeddings,
                "connection_args": connection_args,
                "index_params": index_params,
                "search_params": search_params,
                "consistency_level": "Strong",
                "drop_old": self.drop_old,
            }

            if self.collection_name:
                kwargs["collection_name"] = self.collection_name

            self.vector_store = Milvus(**kwargs)

            if self.verbose:
                logger.info("✅ 向量存储创建成功")

            return True
        except Exception as e:
            logger.error(f"❌ 向量存储创建失败: {e}")
            return False

    # ==================== 文档管理 ====================

    def add_texts(
        self, texts: List[str], metadatas: Optional[List[Dict[str, Any]]] = None
    ) -> bool:
        """添加文本到向量存储"""
        if not self.vector_store:
            logger.error("❌ 请先创建向量存储")
            return False

        try:
            self.vector_store.add_texts(texts, metadatas=metadatas)

            if self.verbose:
                logger.info(f"✅ 成功添加 {len(texts)} 条文档")

            return True
        except Exception as e:
            logger.error(f"❌ 添加文档失败: {e}")
            return False

    def add_documents(self, documents: List[Any]) -> bool:
        """添加 Document 对象到向量存储"""
        if not self.vector_store:
            logger.error("❌ 请先创建向量存储")
            return False

        try:
            self.vector_store.add_documents(documents)

            if self.verbose:
                logger.info(f"✅ 成功添加 {len(documents)} 条文档")
                sources = set()
                for doc in documents:
                    if hasattr(doc, "metadata") and "source" in doc.metadata:
                        sources.add(doc.metadata["source"])
                if sources:
                    logger.info(f"文档来源: {len(sources)} 个文件")

            return True
        except Exception as e:
            logger.error(f"❌ 添加文档失败: {e}")
            return False

    # ==================== 检索和搜索 ====================

    def similarity_search(
        self,
        query: str,
        k: Optional[int] = None,
        filter: Optional[Dict[str, Any]] = None,
    ) -> CompiledStateGraph:
        """相似度搜索并创建 RAG 工作流"""
        if not self.vector_store:
            logger.error("❌ 请先创建向量存储")
            return None

        try:
            search_k = k or settings.DEFAULT_SEARCH_K
            retriever = self.vector_store.as_retriever(search_kwargs={"k": search_k})
            self.retriever_tool = create_retriever_tool(
                retriever,
                settings.RETRIEVER_TOOL_NAME,
                settings.RETRIEVER_TOOL_DESCRIPTION,
            )

            graph = self._build_graph()

            return graph
        except Exception as e:
            logger.error(f"❌ 搜索失败: {e}")
            return None

    def mmr_search(
        self,
        query: str,
        k: Optional[int] = None,
        fetch_k: Optional[int] = None,
        lambda_mult: Optional[float] = None,
    ) -> List[Any]:
        """最大边际相关性搜索（MMR）"""
        if not self.vector_store:
            logger.error("❌ 请先创建向量存储")
            return []

        try:
            search_k = k or settings.DEFAULT_SEARCH_K
            search_fetch_k = fetch_k or settings.MMR_FETCH_K
            search_lambda = lambda_mult or settings.MMR_LAMBDA

            results = self.vector_store.max_marginal_relevance_search(
                query, k=search_k, fetch_k=search_fetch_k, lambda_mult=search_lambda
            )

            if self.verbose:
                logger.info(f"MMR 搜索找到 {len(results)} 条多样化文档")

            return results
        except Exception as e:
            logger.error(f"❌ MMR 搜索失败: {e}")
            return []

    # ==================== 集合管理 ====================

    def get_collection_info(self) -> Optional[Dict[str, Any]]:
        """获取集合信息"""
        try:
            collections = utility.list_collections()

            if not collections:
                logger.info("当前数据库没有集合")
                return None

            target_collection = (
                self.collection_name if self.collection_name else collections[0]
            )

            if target_collection not in collections:
                logger.warning(f"集合 '{target_collection}' 不存在")
                return None

            collection = Collection(name=target_collection)
            collection.load()

            info = {
                "name": target_collection,
                "is_empty": collection.is_empty,
                "description": collection.description,
            }

            for field in collection.schema.fields:
                if field.dtype.name == "FLOAT_VECTOR":
                    info["vector_dim"] = field.params.get("dim")
                    break

            indexes = collection.indexes
            info["indexes"] = [
                {"field": idx.field_name, "params": idx.params} for idx in indexes
            ]

            return info
        except Exception as e:
            logger.error(f"❌ 获取集合信息失败: {e}")
            return None

    def drop_collection(self, collection_name: Optional[str] = None) -> bool:
        """删除集合"""
        try:
            target_name = collection_name or self.collection_name

            if not target_name:
                logger.error("❌ 未指定集合名称")
                return False

            collections = utility.list_collections()

            if target_name not in collections:
                logger.warning(f"集合 '{target_name}' 不存在")
                return False

            collection = Collection(name=target_name)
            collection.drop()

            if self.verbose:
                logger.info(f"✅ 成功删除集合 '{target_name}'")

            return True
        except Exception as e:
            logger.error(f"❌ 删除集合失败: {e}")
            return False

    # ==================== RAG 工作流 ====================

    def generate_query_or_respond(self, state: MessagesState) -> Dict[str, List]:
        """生成查询或直接响应"""
        response = self.llm.bind_tools([self.retriever_tool]).invoke(state["messages"])
        return {"messages": [response]}

    def grade_documents(
        self,
        state: MessagesState,
    ) -> Literal["generate_answer", "rewrite_question"]:
        """评估检索文档的相关性"""
        question = state["messages"][0].content
        context = state["messages"][-1].content

        prompt = GRADE_PROMPT_TEMPLATE.format(question=question, context=context)
        response = self.llm.invoke([{"role": "user", "content": prompt}])

        score = response.content.strip().lower()

        if self.verbose:
            logger.info(f"📊 文档相关性评分: {score}")

        if "yes" in score:
            return "generate_answer"
        else:
            return "rewrite_question"

    def rewrite_question(self, state: MessagesState) -> Dict[str, List]:
        """重写用户问题"""
        messages = state["messages"]
        question = messages[0].content
        prompt = REWRITE_PROMPT_TEMPLATE.format(question=question)
        response = self.llm.invoke([{"role": "user", "content": prompt}])
        return {"messages": [{"role": "user", "content": response.content}]}

    def generate_answer(self, state: MessagesState) -> Dict[str, List]:
        """生成最终答案"""
        question = state["messages"][0].content
        context = state["messages"][-1].content
        prompt = GENERATE_PROMPT_TEMPLATE.format(question=question, context=context)
        response = self.llm.invoke([{"role": "user", "content": prompt}])
        return {"messages": [response]}

    def _build_graph(self, save_path: Optional[str] = None) -> CompiledStateGraph:
        """构建 RAG 工作流图"""
        workflow = StateGraph(MessagesState)

        workflow.add_node(self.generate_query_or_respond)
        workflow.add_node("retrieve", ToolNode([self.retriever_tool]))
        workflow.add_node(self.rewrite_question)
        workflow.add_node(self.generate_answer)

        workflow.add_edge(START, "generate_query_or_respond")

        workflow.add_conditional_edges(
            "generate_query_or_respond",
            tools_condition,
            {
                "tools": "retrieve",
                END: END,
            },
        )

        workflow.add_conditional_edges(
            "retrieve",
            self.grade_documents,
        )

        workflow.add_edge("generate_answer", END)
        workflow.add_edge("rewrite_question", "generate_query_or_respond")

        graph = workflow.compile()

        graph_path = save_path or settings.WORKFLOW_GRAPH_PATH
        self._save_graph_image(graph, graph_path)

        return graph

    def _save_graph_image(
        self, graph: CompiledStateGraph, save_path: Optional[str] = None
    ) -> None:
        """保存工作流图为图片"""
        try:
            png_data = graph.get_graph().draw_mermaid_png()

            if save_path:
                with open(save_path, "wb") as f:
                    f.write(png_data)
                if self.verbose:
                    logger.info(f"✅ 工作流图已保存到: {save_path}")
            else:
                try:
                    display(Image(png_data))
                except NameError:
                    default_path = settings.WORKFLOW_GRAPH_PATH
                    with open(default_path, "wb") as f:
                        f.write(png_data)
                    if self.verbose:
                        logger.info(f"📊 工作流图已保存到: {default_path}")
        except Exception as e:
            logger.warning(f"⚠️ 无法生成工作流图: {e}")

    # ==================== 初始化 ====================

    def initialize(self) -> bool:
        """一键初始化所有组件"""
        steps = [
            ("连接数据库", self.connect),
            ("设置数据库", self.setup_database),
            ("初始化 Embedding 模型", self.init_embeddings),
            ("创建向量存储", self.create_vector_store),
            ("初始化响应模型", self.init_response_model),
        ]

        for step_name, step_func in steps:
            if not step_func():
                logger.error(f"❌ 初始化失败于步骤: {step_name}")
                return False

        if self.verbose:
            logger.info("🎉 Milvus 客户端初始化完成")

        return True


# 兼容旧名称
MilvusUtil = MilvusClient
