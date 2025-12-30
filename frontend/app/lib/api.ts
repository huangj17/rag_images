/**
 * API 请求封装
 */

const API_BASE_URL = "http://localhost:8010";

// ==================== 类型定义 ====================

export interface SearchRequest {
  query: string;
  top_k?: number;
  with_images_only?: boolean;
  collection_name?: string;
}

export interface SearchResultItem {
  chunk_id: string;
  text: string;
  source_file: string;
  section: string;
  images: string[];
  page_number: number;
  score: number;
  text_length: number;
}

export interface SearchResponse {
  success: boolean;
  message: string;
  query: string;
  results: SearchResultItem[];
  total: number;
}

export interface HealthResponse {
  status: string;
  version: string;
  milvus_connected: boolean;
}

export interface DocumentChunk {
  chunk_id: string;
  text: string;
  source_file: string;
  section: string;
  page_number: number;
  images: string[];
  metadata: Record<string, unknown>;
}

export interface ParseStatistics {
  total_chunks: number;
  chunks_with_images: number;
  total_images: number;
  avg_chunk_size: number;
  max_chunk_size: number;
  min_chunk_size: number;
  stored_to_vector?: boolean;
  indexed_count?: number;
  vector_store_error?: string;
  total_files?: number;
}

export interface IndexRequest {
  chunks: DocumentChunk[];
  collection_name?: string;
  drop_old?: boolean;
}

export interface IndexResponse {
  success: boolean;
  message: string;
  indexed_count: number;
}

export interface ParseDocumentRequest {
  file_path: string;
  config?: ChunkingConfig;
}

export interface ChunkingConfig {
  max_chunk_size?: number;
  min_chunk_size?: number;
  chunk_overlap?: number;
  split_by_title?: boolean;
  split_by_paragraph?: boolean;
  force_max_size?: boolean;
  distribute_images_evenly?: boolean;
  title_patterns?: string[];
}

export interface ParseResponse {
  success: boolean;
  message: string;
  chunks: DocumentChunk[];
  statistics: ParseStatistics;
}

// ==================== Chat 类型定义 ====================

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  query: string;
  history?: ChatMessage[];
  top_k?: number;
  collection_name?: string;
}

export interface ChatSourceDocument {
  chunk_id: string;
  text: string;
  source_file: string;
  section: string;
  score: number;
}

export type ChatStreamEventType =
  | "start"
  | "token"
  | "sources"
  | "end"
  | "error";

export interface ChatStreamEvent {
  event: ChatStreamEventType;
  data?: string;
  sources?: ChatSourceDocument[];
  message?: string;
}

export interface ChatSyncResponse {
  success: boolean;
  query: string;
  answer: string;
  sources: ChatSourceDocument[];
}

// ==================== Knowledge Base 类型定义 ====================

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string | null;
  collection_name: string;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBaseListResponse {
  success: boolean;
  items: KnowledgeBase[];
}

export interface KnowledgeBaseCreateRequest {
  name: string;
  description?: string;
  collection_name: string;
}

export interface KnowledgeBaseUpdateRequest {
  name?: string;
  description?: string;
}

// ==================== API 请求函数 ====================

/**
 * 健康检查
 */
export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) {
    throw new Error(`健康检查失败: ${response.status}`);
  }
  return response.json();
}

/**
 * 搜索文档
 */
export async function search(request: SearchRequest): Promise<SearchResponse> {
  const response = await fetch(`${API_BASE_URL}/api/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `搜索失败: ${response.status}`);
  }

  return response.json();
}

/**
 * 获取图片完整 URL
 */
export function getImageUrl(imagePath: string): string {
  // 如果已经是完整 URL
  if (imagePath.startsWith("http")) {
    return imagePath;
  }
  // 通过后端图片 API 访问（支持绝对路径和相对路径）
  return `${API_BASE_URL}/api/images/${encodeURIComponent(imagePath)}`;
}

/**
 * 上传并解析文档
 */
export async function uploadDocument(
  file: File,
  storeToVector: boolean = false,
  collectionName?: string
): Promise<ParseResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("store_to_vector", String(storeToVector));
  if (collectionName) {
    formData.append("collection_name", collectionName);
  }

  const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `上传失败: ${response.status}`);
  }

  return response.json();
}

/**
 * 索引文档块到向量数据库
 */
export async function indexChunks(
  request: IndexRequest
): Promise<IndexResponse> {
  const response = await fetch(`${API_BASE_URL}/api/index`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `索引失败: ${response.status}`);
  }

  return response.json();
}

/**
 * 解析单个文档（服务器端路径）
 */
export async function parseDocument(
  request: ParseDocumentRequest
): Promise<ParseResponse> {
  const response = await fetch(`${API_BASE_URL}/api/documents/parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `解析失败: ${response.status}`);
  }

  return response.json();
}

// ==================== Chat API ====================

/**
 * 流式 Chat 请求
 * 返回一个 ReadableStream，可以通过 reader 读取流式数据
 */
export async function chatStream(
  request: ChatRequest,
  onEvent: (event: ChatStreamEvent) => void,
  onError?: (error: Error) => void
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Chat 请求失败: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("无法获取响应流");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let receivedEnd = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // 保留最后一个可能不完整的行
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            onEvent(data as ChatStreamEvent);
            if (data.event === "end" || data.event === "error") {
              receivedEnd = true;
            }
          } catch (e) {
            console.error("解析 SSE 数据失败:", e);
          }
        }
      }
    }

    // 处理缓冲区中剩余的数据
    if (buffer.startsWith("data: ")) {
      try {
        const data = JSON.parse(buffer.slice(6));
        onEvent(data as ChatStreamEvent);
        if (data.event === "end" || data.event === "error") {
          receivedEnd = true;
        }
      } catch (e) {
        console.error("解析 SSE 数据失败:", e);
      }
    }

    // 如果流结束但没有收到 end 事件，手动发送一个
    if (!receivedEnd) {
      onEvent({ event: "end" });
    }
  } catch (error) {
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error)));
    } else {
      throw error;
    }
  }
}

/**
 * 同步 Chat 请求（非流式）
 */
export async function chatSync(
  request: ChatRequest
): Promise<ChatSyncResponse> {
  const response = await fetch(`${API_BASE_URL}/api/chat/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Chat 请求失败: ${response.status}`);
  }

  return response.json();
}

// ==================== Knowledge Base API ====================

export async function listKnowledgeBases(): Promise<KnowledgeBaseListResponse> {
  const response = await fetch(`${API_BASE_URL}/api/knowledge-bases`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `获取知识库列表失败: ${response.status}`);
  }
  return response.json();
}

export async function getKnowledgeBase(id: string): Promise<KnowledgeBase> {
  const response = await fetch(`${API_BASE_URL}/api/knowledge-bases/${id}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `获取知识库失败: ${response.status}`);
  }
  return response.json();
}

export async function createKnowledgeBase(
  request: KnowledgeBaseCreateRequest
): Promise<KnowledgeBase> {
  const response = await fetch(`${API_BASE_URL}/api/knowledge-bases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `创建知识库失败: ${response.status}`);
  }
  return response.json();
}

export async function updateKnowledgeBase(
  id: string,
  request: KnowledgeBaseUpdateRequest
): Promise<KnowledgeBase> {
  const response = await fetch(`${API_BASE_URL}/api/knowledge-bases/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `更新知识库失败: ${response.status}`);
  }
  return response.json();
}

export async function deleteKnowledgeBase(
  id: string
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/knowledge-bases/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `删除知识库失败: ${response.status}`);
  }
  return response.json();
}
