import {
  Avatar,
  Button,
  Card,
  CardBody,
  Chip,
  ScrollShadow,
  Textarea,
  Tooltip,
} from "@heroui/react";
import {
  ChevronRight,
  MessageCircle,
  Monitor,
  Send,
  Trash2,
  User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  chatStream,
  type ChatMessage,
  type ChatSourceDocument,
  type ChatStreamEvent,
  type KnowledgeBase,
} from "../lib/api";
import { KnowledgeBaseSelector } from "./KnowledgeBaseSelector";
import { RichText } from "./RichText";

interface Message extends ChatMessage {
  id: string;
  sources?: ChatSourceDocument[];
  isStreaming?: boolean;
}

interface ChatPageProps {
  className?: string;
  knowledgeBase: KnowledgeBase | null;
  onKnowledgeBaseChange: (kb: KnowledgeBase | null) => void;
}

export function ChatPage({
  className,
  knowledgeBase,
  onKnowledgeBaseChange,
}: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 生成唯一 ID
  const generateId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // 发送消息
  const handleSend = async () => {
    const query = input.trim();
    if (!query || isLoading) return;

    setInput("");
    setError(null);

    // 添加用户消息
    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: query,
    };
    setMessages((prev) => [...prev, userMessage]);

    // 添加助手消息占位
    const assistantMessageId = generateId();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    setIsLoading(true);

    try {
      // 构建历史消息（不包括当前消息）
      const history: ChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // 流式请求
      await chatStream(
        {
          query,
          history,
          top_k: 5,
          collection_name: knowledgeBase?.collection_name,
        },
        (event: ChatStreamEvent) => {
          switch (event.event) {
            case "start":
              // 开始生成
              break;
            case "token":
              // 追加 token
              if (event.data) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + event.data }
                      : m
                  )
                );
              }
              break;
            case "sources":
              // 更新源文档
              if (event.sources) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, sources: event.sources }
                      : m
                  )
                );
              }
              break;
            case "end":
              // 结束生成
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, isStreaming: false } : m
                )
              );
              setIsLoading(false);
              break;
            case "error":
              // 错误
              setError(event.message || "生成回答时出错");
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: m.content || "生成回答时出错，请重试。",
                        isStreaming: false,
                      }
                    : m
                )
              );
              setIsLoading(false);
              break;
          }
        },
        (err) => {
          setError(err.message);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: `请求失败：${err.message}`,
                    isStreaming: false,
                  }
                : m
            )
          );
          setIsLoading(false);
        }
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      setError(errorMessage);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: `请求失败：${errorMessage}`, isStreaming: false }
            : m
        )
      );
      setIsLoading(false);
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 清空对话
  const handleClear = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className={`flex flex-col h-full ${className || ""}`}>
      {/* 对话区域 */}
      <div className="flex-1 min-h-0">
        <ScrollShadow className="h-full px-2">
          {messages.length === 0 ? (
            // 空状态
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="empty-icon inline-block">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center shadow-lg shadow-indigo-200/50 dark:shadow-none">
                  <MessageCircle className="h-10 w-10 text-indigo-500" />
                </div>
              </div>
              <h3 className="mt-5 text-base font-semibold text-gray-700 dark:text-gray-300">
                开始智能问答
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                基于 RAG 技术，从文档中检索相关内容并生成回答
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Chip
                  variant="flat"
                  className="cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                  onClick={() => setInput("这个项目是做什么的？")}
                >
                  这个项目是做什么的？
                </Chip>
                <Chip
                  variant="flat"
                  className="cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                  onClick={() => setInput("如何开始使用？")}
                >
                  如何开始使用？
                </Chip>
              </div>
            </div>
          ) : (
            // 消息列表
            <div className="space-y-6 py-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollShadow>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2">
          <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            {error}
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm p-4">
        <div className="space-y-3">
          <KnowledgeBaseSelector
            value={knowledgeBase}
            onChange={onKnowledgeBaseChange}
            isDisabled={isLoading}
            label="问答知识库"
          />

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Textarea
                ref={textareaRef}
                name="chat_query"
                value={input}
                onValueChange={setInput}
                onKeyDown={handleKeyDown}
                placeholder="输入您的问题..."
                minRows={1}
                maxRows={5}
                classNames={{
                  inputWrapper:
                    "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm",
                }}
                isDisabled={isLoading}
              />
            </div>
            <div className="flex gap-2">
              <Tooltip content="清空对话">
                <Button
                  isIconOnly
                  variant="light"
                  onPress={handleClear}
                  isDisabled={messages.length === 0 || isLoading}
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </Tooltip>
              <Button
                color="primary"
                onPress={handleSend}
                isDisabled={!input.trim() || isLoading}
                isLoading={isLoading}
                className="bg-gradient-to-r from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/25"
              >
                {!isLoading && <Send className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 消息气泡组件
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const [showSources, setShowSources] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // 按文件分组 sources
  const groupedSources = (message.sources || []).reduce((acc, source) => {
    const file = source.source_file;
    if (!acc[file]) {
      acc[file] = [];
    }
    acc[file].push(source);
    return acc;
  }, {} as Record<string, typeof message.sources>);

  // 切换文件展开状态
  const toggleFileExpand = (file: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  };

  // 获取文件名（去除路径）
  const getFileName = (filePath: string) => {
    return filePath.split("/").pop() || filePath;
  };

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* 头像 */}
      <Avatar
        size="sm"
        className={`flex-shrink-0 ${
          isUser
            ? "bg-gradient-to-br from-blue-500 to-indigo-500"
            : "bg-gradient-to-br from-emerald-500 to-teal-500"
        }`}
        showFallback
        fallback={
          isUser ? (
            <User className="w-4 h-4 text-white" />
          ) : (
            <Monitor className="w-4 h-4 text-white" />
          )
        }
      />

      {/* 消息内容 */}
      <div className={`flex-1 max-w-[80%] ${isUser ? "text-right" : ""}`}>
        <Card
          className={`inline-block ${
            isUser
              ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white"
              : "bg-white dark:bg-gray-800"
          }`}
          shadow="sm"
        >
          <CardBody className="py-3 px-4">
            <div
              className={`text-sm ${
                isUser ? "text-white" : "text-gray-700 dark:text-gray-200"
              }`}
            >
              {isUser ? (
                message.content
              ) : (
                <RichText text={message.content} imageMaxHeight="max-h-64" />
              )}
              {message.isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
              )}
            </div>
          </CardBody>
        </Card>

        {/* 源文档 - 按文件分组显示 */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-2">
            <Button
              size="sm"
              variant="light"
              onPress={() => setShowSources(!showSources)}
              className="text-xs text-gray-500"
              startContent={
                <ChevronRight
                  className={`w-3 h-3 transition-transform ${
                    showSources ? "rotate-90" : ""
                  }`}
                />
              }
            >
              参考来源 ({Object.keys(groupedSources).length} 个文件)
            </Button>

            {showSources && (
              <div className="mt-2 space-y-2">
                {Object.entries(groupedSources).map(
                  ([file, chunks], fileIdx) => (
                    <Card
                      key={file}
                      className="bg-gray-50 dark:bg-gray-800/50"
                      shadow="none"
                    >
                      <CardBody className="p-0">
                        {/* 文件标题 - 可点击展开 */}
                        <button
                          type="button"
                          onClick={() => toggleFileExpand(file)}
                          className="w-full p-3 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-lg transition-colors text-left"
                        >
                          <ChevronRight
                            className={`w-3 h-3 text-gray-400 transition-transform ${
                              expandedFiles.has(file) ? "rotate-90" : ""
                            }`}
                          />
                          <Chip
                            size="sm"
                            variant="flat"
                            color="primary"
                            className="shrink-0"
                          >
                            {fileIdx + 1}
                          </Chip>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-700 dark:text-gray-300 truncate font-medium">
                              {getFileName(file)}
                            </div>
                          </div>
                          <Chip
                            size="sm"
                            variant="flat"
                            color="default"
                            className="shrink-0"
                          >
                            {chunks?.length || 0} 处引用
                          </Chip>
                        </button>

                        {/* 展开后显示具体切片 */}
                        {expandedFiles.has(file) && chunks && (
                          <div className="px-3 pb-3 space-y-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                            {chunks.map((source, chunkIdx) => (
                              <div
                                key={chunkIdx}
                                className="pl-6 py-2 border-l-2 border-primary-200 dark:border-primary-800"
                              >
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {source.section}
                                  <span className="ml-2 text-gray-400">
                                    相似度: {(source.score * 100).toFixed(1)}%
                                  </span>
                                </div>
                                <RichText
                                  text={source.text}
                                  className="text-sm text-gray-700 dark:text-gray-300 mt-1"
                                  imageMaxHeight="max-h-32"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
