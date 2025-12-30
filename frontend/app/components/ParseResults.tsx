import {
  Accordion,
  AccordionItem,
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Image,
  Spinner,
} from "@heroui/react";
import { useState } from "react";
import {
  getImageUrl,
  indexChunks,
  type DocumentChunk,
  type ParseStatistics,
} from "../lib/api";

interface ParseResultsProps {
  chunks: DocumentChunk[];
  statistics: ParseStatistics;
  fileName: string;
  onIndexStatusChange?: (stored: boolean) => void;
  collectionName?: string;
}

export function ParseResults({
  chunks,
  statistics,
  fileName,
  onIndexStatusChange,
  collectionName,
}: ParseResultsProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [isStored, setIsStored] = useState(
    statistics.stored_to_vector ?? false
  );

  const expandAll = () => {
    setSelectedKeys(new Set(chunks.map((c) => c.chunk_id)));
  };

  const collapseAll = () => {
    setSelectedKeys(new Set());
  };

  const handleIndexToVector = async () => {
    if (chunks.length === 0) return;

    setIsIndexing(true);
    setIndexError(null);

    try {
      const response = await indexChunks({
        chunks,
        collection_name:
          collectionName ||
          (typeof (statistics as unknown as Record<string, unknown>)
            .collection_name === "string"
            ? ((statistics as unknown as Record<string, unknown>)
                .collection_name as string)
            : undefined),
      });
      if (response.success) {
        setIsStored(true);
        onIndexStatusChange?.(true);
      }
    } catch (err) {
      setIndexError(err instanceof Error ? err.message : "索引失败");
    } finally {
      setIsIndexing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 统计信息卡片 */}
      <Card className="bg-gradient-to-r from-primary-50 to-secondary-50 dark:from-primary-900/20 dark:to-secondary-900/20">
        <CardHeader className="flex justify-between items-center pb-0">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <h3 className="text-lg font-semibold">解析统计</h3>
          </div>
          <div>
            {isStored ? (
              <Chip
                color="success"
                variant="flat"
                startContent={
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                }
              >
                已存储到向量库
              </Chip>
            ) : (
              <Button
                color="primary"
                size="sm"
                onPress={handleIndexToVector}
                isDisabled={isIndexing || chunks.length === 0}
                isLoading={isIndexing}
                spinner={<Spinner size="sm" color="white" />}
                startContent={
                  !isIndexing && (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  )
                }
              >
                {isIndexing ? "索引中..." : "索引到向量库"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatItem label="文档名称" value={fileName} isText />
            <StatItem label="文本块数" value={statistics.total_chunks} />
            <StatItem label="含图片块" value={statistics.chunks_with_images} />
            <StatItem label="图片总数" value={statistics.total_images} />
            <StatItem
              label="平均块大小"
              value={`${statistics.avg_chunk_size} 字`}
              isText
            />
            <StatItem
              label="块大小范围"
              value={`${statistics.min_chunk_size}-${statistics.max_chunk_size}`}
              isText
            />
          </div>

          {(statistics.vector_store_error || indexError) && (
            <Alert
              color="warning"
              variant="flat"
              className="mt-4"
              title="向量库存储警告"
              description={indexError || statistics.vector_store_error}
            />
          )}
        </CardBody>
      </Card>

      {/* 文本块列表 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            解析结果 ({chunks.length} 个文本块)
          </h3>
          <div className="flex gap-2">
            <Button
              variant="light"
              color="primary"
              size="sm"
              onPress={expandAll}
            >
              展开全部
            </Button>
            <Button
              variant="light"
              color="primary"
              size="sm"
              onPress={collapseAll}
            >
              收起全部
            </Button>
          </div>
        </div>

        <Accordion
          selectionMode="multiple"
          selectedKeys={selectedKeys}
          onSelectionChange={(keys) => setSelectedKeys(keys as Set<string>)}
          variant="shadow"
        >
          {chunks.map((chunk, index) => {
            const hasImages = chunk.images.length > 0;
            return (
              <AccordionItem
                key={chunk.chunk_id}
                aria-label={`文本块 ${index + 1}`}
                startContent={
                  <div className="flex items-center gap-3">
                    <Chip
                      color="primary"
                      variant="flat"
                      size="sm"
                      radius="full"
                    >
                      {index + 1}
                    </Chip>
                  </div>
                }
                title={
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {chunk.section || "未分类"}
                    </span>
                    {hasImages && (
                      <Chip
                        color="secondary"
                        variant="flat"
                        size="sm"
                        startContent={
                          <svg
                            className="h-3 w-3"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                              clipRule="evenodd"
                            />
                          </svg>
                        }
                      >
                        {chunk.images.length} 张图片
                      </Chip>
                    )}
                  </div>
                }
                subtitle={
                  <span className="text-default-400">
                    页码: {chunk.page_number} · {chunk.text.length} 字符
                  </span>
                }
              >
                <div className="space-y-4 pb-2">
                  {/* 文本内容 */}
                  <div>
                    <p className="text-xs font-medium text-default-500 mb-2">
                      文本内容
                    </p>
                    <Card shadow="none" className="bg-default-100">
                      <CardBody className="max-h-64 overflow-y-auto">
                        <p className="text-sm whitespace-pre-wrap">
                          {chunk.text}
                        </p>
                      </CardBody>
                    </Card>
                  </div>

                  {/* 关联图片 */}
                  {hasImages && (
                    <div>
                      <p className="text-xs font-medium text-default-500 mb-2">
                        关联图片 ({chunk.images.length})
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {chunk.images.map((imagePath, imgIndex) => (
                          <a
                            key={imgIndex}
                            href={getImageUrl(imagePath)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Image
                              src={getImageUrl(imagePath)}
                              alt={`图片 ${imgIndex + 1}`}
                              className="aspect-video object-cover"
                              radius="md"
                              fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='1' d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'/%3E%3C/svg%3E"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 元数据 */}
                  {Object.keys(chunk.metadata).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-default-500 mb-2">
                        元数据
                      </p>
                      <Card shadow="none" className="bg-default-100">
                        <CardBody>
                          <pre className="text-xs overflow-x-auto">
                            {JSON.stringify(chunk.metadata, null, 2)}
                          </pre>
                        </CardBody>
                      </Card>
                    </div>
                  )}
                </div>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    </div>
  );
}

function StatItem({
  label,
  value,
  isText = false,
}: {
  label: string;
  value: string | number;
  isText?: boolean;
}) {
  return (
    <div className="text-center">
      <p className="text-xs text-default-500 mb-1">{label}</p>
      <p
        className={`font-semibold ${isText ? "text-sm truncate" : "text-xl"}`}
        title={String(value)}
      >
        {value}
      </p>
    </div>
  );
}
