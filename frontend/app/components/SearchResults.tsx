import { Chip } from "@heroui/react";
import type { SearchResultItem } from "../lib/api";
import { ResultCard } from "./ResultCard";

interface SearchResultsProps {
  results: SearchResultItem[];
  query: string;
  total: number;
}

export function SearchResults({ results, query, total }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center shadow-lg shadow-amber-200/50 dark:shadow-none">
          <svg
            className="h-10 w-10 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 className="mt-6 text-lg font-semibold text-gray-700 dark:text-gray-300">
          未找到相关结果
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          未找到与 "
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {query}
          </span>
          " 相关的内容
        </p>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
          请尝试使用不同的关键词
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 结果统计 */}
      <div className="flex items-center justify-between bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm rounded-xl px-5 py-3 border border-gray-100 dark:border-gray-800">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          找到{" "}
          <span className="font-bold text-gray-800 dark:text-gray-200">
            {total}
          </span>{" "}
          条相关结果
        </p>
        <Chip
          variant="flat"
          size="sm"
          classNames={{
            base: "bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800",
            content: "text-blue-600 dark:text-blue-400 font-medium text-xs",
          }}
          startContent={
            <svg
              className="w-3 h-3"
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
          }
        >
          {query}
        </Chip>
      </div>

      {/* 结果列表 */}
      <div className="space-y-5">
        {results.map((result, index) => (
          <ResultCard key={result.chunk_id} result={result} index={index} />
        ))}
      </div>
    </div>
  );
}
