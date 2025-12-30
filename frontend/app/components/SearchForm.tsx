import {
  Button,
  Checkbox,
  Input,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";
import { useState, type FormEvent } from "react";
import type { KnowledgeBase } from "../lib/api";
import { KnowledgeBaseSelector } from "./KnowledgeBaseSelector";

interface SearchFormProps {
  onSearch: (query: string, topK: number, withImagesOnly: boolean) => void;
  isLoading: boolean;
  knowledgeBase: KnowledgeBase | null;
  onKnowledgeBaseChange: (kb: KnowledgeBase | null) => void;
}

const topKOptions = [
  { key: "3", label: "3" },
  { key: "5", label: "5" },
  { key: "10", label: "10" },
  { key: "15", label: "15" },
  { key: "20", label: "20" },
];

export function SearchForm({
  onSearch,
  isLoading,
  knowledgeBase,
  onKnowledgeBaseChange,
}: SearchFormProps) {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState("3");
  const [withImagesOnly, setWithImagesOnly] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), Number(topK), withImagesOnly);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 搜索输入框 */}
      <div className="search-glow rounded-2xl transition-all duration-300">
        <Input
          type="text"
          value={query}
          onValueChange={setQuery}
          placeholder="输入搜索内容..."
          size="lg"
          variant="bordered"
          isDisabled={isLoading}
          endContent={
            <Button
              type="submit"
              color="primary"
              isDisabled={isLoading || !query.trim()}
              isIconOnly
              radius="lg"
              className="min-w-11 h-11 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105"
            >
              {isLoading ? (
                <Spinner size="sm" color="white" />
              ) : (
                <svg
                  className="h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              )}
            </Button>
          }
          classNames={{
            base: "group",
            inputWrapper:
              "pr-1.5 h-14 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 group-hover:border-blue-300 dark:group-hover:border-blue-700 transition-colors rounded-2xl",
            input: "text-base placeholder:text-gray-400",
          }}
        />
      </div>

      {/* 搜索选项 */}
      <div className="flex flex-wrap gap-6 items-center">
        {/* 知识库选择 */}
        <div className="min-w-[260px]">
          <KnowledgeBaseSelector
            value={knowledgeBase}
            onChange={onKnowledgeBaseChange}
            isDisabled={isLoading}
          />
        </div>

        {/* 结果数量 */}
        <Select
          label="返回数量"
          name="top_k"
          selectedKeys={[topK]}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0];
            if (selected) setTopK(String(selected));
          }}
          size="sm"
          variant="bordered"
          isDisabled={isLoading}
          className="w-36"
          classNames={{
            trigger:
              "min-h-12 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors rounded-xl",
            label: "text-gray-500 dark:text-gray-400",
            value: "text-gray-700 dark:text-gray-300 font-medium",
          }}
        >
          {topKOptions.map((option) => (
            <SelectItem key={option.key}>{option.label}</SelectItem>
          ))}
        </Select>

        {/* 仅含图片 */}
        <Checkbox
          name="with_images_only"
          isSelected={withImagesOnly}
          onValueChange={setWithImagesOnly}
          isDisabled={isLoading}
          size="md"
          classNames={{
            base: "group",
            wrapper: "group-hover:border-blue-400 transition-colors",
            label:
              "text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-300 transition-colors",
          }}
        >
          仅显示含图片的结果
        </Checkbox>
      </div>
    </form>
  );
}
