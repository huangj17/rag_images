import { Button, Card, CardBody, Checkbox, Chip, Spinner } from "@heroui/react";
import { useCallback, useRef, useState, type DragEvent } from "react";
import type { KnowledgeBase } from "../lib/api";
import { KnowledgeBaseSelector } from "./KnowledgeBaseSelector";

interface FileUploadProps {
  onUpload: (file: File, storeToVector: boolean) => void;
  isUploading: boolean;
  acceptedFormats?: string[];
  knowledgeBase: KnowledgeBase | null;
  onKnowledgeBaseChange: (kb: KnowledgeBase | null) => void;
  defaultStoreToVector?: boolean;
  requireKnowledgeBase?: boolean;
  showKnowledgeBaseSelector?: boolean;
  storeToVector?: boolean;
  onStoreToVectorChange?: (value: boolean) => void;
  isDisabledExternally?: boolean;
}

export function FileUpload({
  onUpload,
  isUploading,
  acceptedFormats = [".docx", ".md", ".pdf"],
  knowledgeBase,
  onKnowledgeBaseChange,
  defaultStoreToVector = false,
  requireKnowledgeBase = false,
  showKnowledgeBaseSelector = true,
  storeToVector: storeToVectorProp,
  onStoreToVectorChange,
  isDisabledExternally = false,
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [storeToVectorState, setStoreToVectorState] =
    useState(defaultStoreToVector);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const storeToVector = storeToVectorProp ?? storeToVectorState;
  const setStoreToVector = useCallback(
    (v: boolean) => {
      if (onStoreToVectorChange) onStoreToVectorChange(v);
      else setStoreToVectorState(v);
    },
    [onStoreToVectorChange]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const validateFile = useCallback(
    (file: File): boolean => {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      return acceptedFormats.includes(ext);
    },
    [acceptedFormats]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (validateFile(file)) {
          setSelectedFile(file);
        } else {
          alert(
            `不支持的文件格式，请上传 ${acceptedFormats.join(", ")} 格式的文件`
          );
        }
      }
    },
    [acceptedFormats, validateFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (validateFile(file)) {
          setSelectedFile(file);
        } else {
          alert(
            `不支持的文件格式，请上传 ${acceptedFormats.join(", ")} 格式的文件`
          );
        }
      }
    },
    [acceptedFormats, validateFile]
  );

  const handleUploadClick = useCallback(() => {
    if (selectedFile) {
      onUpload(selectedFile, storeToVector);
    }
  }, [selectedFile, storeToVector, onUpload]);

  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-5">
      {/* 拖拽上传区域 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer
          transition-all duration-300 group
          ${
            isDragOver
              ? "border-violet-400 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 scale-[1.01]"
              : "border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-gradient-to-br hover:from-violet-50/50 hover:to-purple-50/50 dark:hover:from-violet-900/10 dark:hover:to-purple-900/10"
          }
          ${isUploading ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats.join(",")}
          onChange={handleFileSelect}
          disabled={isUploading || isDisabledExternally}
          className="hidden"
        />

        <div
          className={`
          mx-auto w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
          ${
            isDragOver
              ? "bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg shadow-violet-500/30"
              : "bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-700 group-hover:from-violet-100 group-hover:to-purple-100 dark:group-hover:from-violet-900/30 dark:group-hover:to-purple-900/30"
          }
        `}
        >
          <svg
            className={`h-8 w-8 transition-colors duration-300 ${
              isDragOver
                ? "text-white"
                : "text-gray-400 group-hover:text-violet-500"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>

        <p className="mt-5 text-base text-gray-600 dark:text-gray-400">
          {isDragOver ? (
            <span className="text-violet-600 dark:text-violet-400 font-medium">
              松开鼠标上传文件
            </span>
          ) : (
            <>
              <span className="text-violet-600 dark:text-violet-400 font-medium">
                点击选择文件
              </span>
              <span className="text-gray-500"> 或拖拽文件到此处</span>
            </>
          )}
        </p>
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
          支持格式: {acceptedFormats.join(", ")}
        </p>
      </div>

      {/* 已选择的文件 */}
      {selectedFile && (
        <Card
          shadow="sm"
          classNames={{
            base: "bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-violet-200 dark:hover:border-violet-800 transition-colors",
          }}
        >
          <CardBody className="flex flex-row items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 flex items-center justify-center">
                <svg
                  className="h-6 w-6 text-violet-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {selectedFile.name}
                </p>
                <Chip
                  size="sm"
                  variant="flat"
                  classNames={{
                    base: "mt-1 bg-gray-100 dark:bg-gray-800",
                    content:
                      "text-gray-500 dark:text-gray-400 text-xs font-medium",
                  }}
                >
                  {formatFileSize(selectedFile.size)}
                </Chip>
              </div>
            </div>
            <Button
              isIconOnly
              variant="light"
              color="danger"
              size="sm"
              radius="lg"
              onPress={handleClearFile}
              isDisabled={isUploading || isDisabledExternally}
              className="hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </Button>
          </CardBody>
        </Card>
      )}

      {/* 选项和上传按钮 */}
      {selectedFile && (
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          {/* 知识库选择 */}
          {showKnowledgeBaseSelector && (
            <div className="min-w-[260px]">
              <KnowledgeBaseSelector
                value={knowledgeBase}
                onChange={onKnowledgeBaseChange}
                isDisabled={isUploading || isDisabledExternally}
              />
            </div>
          )}

          {/* 存储到向量库选项 */}
          <Checkbox
            isSelected={storeToVector}
            onValueChange={setStoreToVector}
            isDisabled={isUploading || isDisabledExternally}
            size="md"
            classNames={{
              base: "group",
              wrapper: "group-hover:border-violet-400 transition-colors",
              label:
                "text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-300 transition-colors",
            }}
          >
            解析后存储到向量库（用于后续搜索）
          </Checkbox>

          {requireKnowledgeBase && !knowledgeBase && (
            <div className="text-sm text-red-600 dark:text-red-400">
              请先选择知识库后再上传
            </div>
          )}

          {storeToVector && !knowledgeBase && (
            <div className="text-sm text-red-600 dark:text-red-400">
              请先选择知识库后再入库
            </div>
          )}

          {/* 上传按钮 */}
          <Button
            color="secondary"
            onPress={handleUploadClick}
            isDisabled={
              isUploading ||
              isDisabledExternally ||
              (requireKnowledgeBase && !knowledgeBase) ||
              (storeToVector && !knowledgeBase)
            }
            isLoading={isUploading}
            radius="lg"
            spinner={<Spinner size="sm" color="white" />}
            className="bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 transition-all duration-300 hover:scale-105 px-6"
            startContent={
              !isUploading && (
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              )
            }
          >
            {isUploading ? "解析中..." : "上传解析"}
          </Button>
        </div>
      )}
    </div>
  );
}
