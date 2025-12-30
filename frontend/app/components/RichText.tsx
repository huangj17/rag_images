import { Image, Modal, ModalBody, ModalContent } from "@heroui/react";
import { useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { getImageUrl } from "../lib/api";

// 将 [IMG:路径] 占位符转成标准 Markdown 图片（并将路径映射到可访问 URL）
function normalizeMarkdownWithImages(text: string): string {
  // 1) 先把 Markdown 图片里的占位符：![alt]([IMG:xxx]) => ![alt](<realUrl>)
  const step1 = text.replace(
    /!\[([^\]]*)]\(\s*\[IMG:([^\]]+)\]\s*\)/g,
    (_m, alt: string, imagePath: string) =>
      `![${alt || "文档图片"}](${getImageUrl(imagePath)})`
  );

  // 2) 再把裸的占位符：[IMG:xxx] => ![文档图片](<realUrl>)
  //    用空行包一下，避免紧贴文字时显示不美观
  return step1.replace(/\[IMG:([^\]]+)\]/g, (_m, imagePath: string) => {
    const url = getImageUrl(imagePath);
    return `\n\n![文档图片](${url})\n\n`;
  });
}

interface RichTextProps {
  text: string;
  className?: string;
  /** 图片最大高度，默认 max-h-48 */
  imageMaxHeight?: string;
  /** 是否启用 Markdown 渲染，默认 true */
  markdown?: boolean;
}

/**
 * 富文本组件：支持 Markdown 渲染和 [IMG:路径] 格式的图片引用
 */
export function RichText({
  text,
  className,
  imageMaxHeight = "max-h-48",
  markdown = true,
}: RichTextProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const markdownText = useMemo(() => {
    if (!markdown) return text;
    return normalizeMarkdownWithImages(text);
  }, [text, markdown]);

  const markdownComponents = useMemo<Components>(
    () => ({
      code: ({ children, className: codeClassName }) => {
        const isInline = !codeClassName;
        return isInline ? (
          <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-pink-500 dark:text-pink-400 text-sm font-mono">
            {children}
          </code>
        ) : (
          <code className={codeClassName}>{children}</code>
        );
      },
      pre: ({ children }) => (
        <pre className="my-2 p-3 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-x-auto text-sm">
          {children}
        </pre>
      ),
      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
      ul: ({ children }) => (
        <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
      ),
      strong: ({ children }) => (
        <strong className="font-semibold">{children}</strong>
      ),
      img: ({ src, alt }) => {
        if (!src) return null;
        return (
          <button
            type="button"
            onClick={() => setExpandedImage(src)}
            className="block my-3"
          >
            <Image
              src={src}
              alt={alt || "文档图片"}
              className={`max-w-full ${imageMaxHeight} object-contain cursor-pointer hover:opacity-80 transition-opacity`}
              radius="md"
              fallbackSrc='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect fill="%23f3f4f6" width="200" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12">图片加载失败</text></svg>'
            />
          </button>
        );
      },
    }),
    [imageMaxHeight]
  );

  return (
    <>
      <div className={className}>
        {markdown ? (
          <ReactMarkdown components={markdownComponents}>
            {markdownText}
          </ReactMarkdown>
        ) : (
          <span>{text}</span>
        )}
      </div>

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
