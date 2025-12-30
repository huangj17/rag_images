import {
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Image,
  Modal,
  ModalBody,
  ModalContent,
} from "@heroui/react";
import { useMemo, useState, type ReactNode } from "react";
import type { SearchResultItem } from "../lib/api";
import { getImageUrl } from "../lib/api";

interface ResultCardProps {
  result: SearchResultItem;
  index: number;
}

// 图片引用正则：匹配 [IMG:路径]
const IMG_PATTERN = /\[IMG:([^\]]+)\]/g;

export function ResultCard({ result, index }: ResultCardProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // 计算相似度百分比（分数越低越相似）
  const similarityPercent = Math.max(
    0,
    Math.min(100, (1 - result.score) * 100)
  );

  // 获取相似度颜色
  const getSimilarityColor = () => {
    if (similarityPercent > 70) return "success";
    if (similarityPercent > 40) return "warning";
    return "danger";
  };

  // 解析文本中的图片引用，将 [IMG:路径] 替换为实际图片
  const parsedContent = useMemo(() => {
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;

    // 重置正则的 lastIndex
    IMG_PATTERN.lastIndex = 0;

    while ((match = IMG_PATTERN.exec(result.text)) !== null) {
      // 添加图片之前的文本
      if (match.index > lastIndex) {
        parts.push(
          <span key={key++}>{result.text.slice(lastIndex, match.index)}</span>
        );
      }

      // 添加图片
      const imagePath = match[1];
      const imageUrl = getImageUrl(imagePath);
      parts.push(
        <button
          key={key++}
          onClick={() => setExpandedImage(imageUrl)}
          className="inline-block my-2 mx-1 align-middle"
        >
          <Image
            src={imageUrl}
            alt="文档图片"
            className="max-w-full max-h-64 object-contain cursor-pointer hover:opacity-80 transition-opacity"
            radius="md"
            fallbackSrc='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect fill="%23f3f4f6" width="200" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12">图片加载失败</text></svg>'
          />
        </button>
      );

      lastIndex = match.index + match[0].length;
    }

    // 添加剩余的文本
    if (lastIndex < result.text.length) {
      parts.push(<span key={key++}>{result.text.slice(lastIndex)}</span>);
    }

    return parts.length > 0 ? parts : result.text;
  }, [result.text]);

  return (
    <>
      <Card
        shadow="sm"
        className="hover-lift overflow-hidden border-0"
        classNames={{
          base: "bg-white dark:bg-gray-900 shadow-lg shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800",
        }}
      >
        <CardHeader className="flex justify-between items-center bg-gradient-to-r from-gray-50 to-blue-50/30 dark:from-gray-800 dark:to-gray-800/50 py-4 px-5">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-sm font-bold shadow-md shadow-blue-500/20">
              {index + 1}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                相似度
              </span>
              <Chip
                size="sm"
                classNames={{
                  base:
                    similarityPercent > 70
                      ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
                      : similarityPercent > 40
                      ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                      : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800",
                  content:
                    similarityPercent > 70
                      ? "text-emerald-600 dark:text-emerald-400 font-bold text-xs"
                      : similarityPercent > 40
                      ? "text-amber-600 dark:text-amber-400 font-bold text-xs"
                      : "text-red-600 dark:text-red-400 font-bold text-xs",
                }}
              >
                {similarityPercent.toFixed(1)}%
              </Chip>
            </div>
          </div>
          <Chip
            size="sm"
            classNames={{
              base: "bg-gray-100 dark:bg-gray-800",
              content: "text-gray-500 dark:text-gray-400 text-xs font-medium",
            }}
          >
            {result.text_length} 字符
          </Chip>
        </CardHeader>

        <Divider className="opacity-50" />

        <CardBody className="space-y-4 p-5">
          {/* 文本内容（含内联图片） */}
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-300">
            {parsedContent}
          </div>

          <Divider className="opacity-50" />

          {/* 元信息 */}
          <div className="flex flex-wrap gap-2">
            <Chip
              size="sm"
              classNames={{
                base: "bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
                content: "text-gray-600 dark:text-gray-400 text-xs font-medium",
              }}
              startContent={
                <svg
                  className="w-3.5 h-3.5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              }
            >
              {result.source_file.split("/").pop()}
            </Chip>

            {result.section && (
              <Chip
                size="sm"
                classNames={{
                  base: "bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800",
                  content:
                    "text-violet-600 dark:text-violet-400 text-xs font-medium",
                }}
                startContent={
                  <svg
                    className="w-3.5 h-3.5 text-violet-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                }
              >
                {result.section}
              </Chip>
            )}

            {result.page_number > 0 && (
              <Chip
                size="sm"
                classNames={{
                  base: "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800",
                  content:
                    "text-blue-600 dark:text-blue-400 text-xs font-medium",
                }}
                startContent={
                  <svg
                    className="w-3.5 h-3.5 text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                }
              >
                第 {result.page_number} 页
              </Chip>
            )}
          </div>
        </CardBody>
      </Card>

      {/* 图片放大查看模态框 */}
      <Modal
        isOpen={!!expandedImage}
        onClose={() => setExpandedImage(null)}
        size="4xl"
        backdrop="blur"
        classNames={{
          body: "p-0",
        }}
      >
        <ModalContent>
          <ModalBody className="p-2">
            {expandedImage && (
              <Image
                src={expandedImage}
                alt="放大查看"
                className="max-h-[85vh] object-contain mx-auto"
                radius="lg"
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
