import { Alert, Card, CardBody, Spinner } from "@heroui/react";
import { useState } from "react";
import { useOutletContext } from "react-router";
import { SearchForm } from "../components/SearchForm";
import { SearchResults } from "../components/SearchResults";
import { search, type SearchResultItem } from "../lib/api";
import type { AppOutletContext } from "./home";

export default function SearchRoute() {
  const { knowledgeBase, setKnowledgeBase } =
    useOutletContext<AppOutletContext>();

  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (
    searchQuery: string,
    topK: number,
    withImagesOnly: boolean
  ) => {
    setIsLoading(true);
    setError(null);
    setQuery(searchQuery);
    setHasSearched(true);

    try {
      const response = await search({
        query: searchQuery,
        top_k: topK,
        with_images_only: withImagesOnly,
        collection_name: knowledgeBase?.collection_name,
      });
      setResults(response.results);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索出错");
      setResults([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="content-container">
      <header className="content-header">
        <h2 className="content-title">文档搜索</h2>
        <p className="content-description">使用语义搜索查找相关文档内容</p>
      </header>

      <Card
        className="mb-6 glass-card"
        shadow="lg"
        classNames={{
          base: "border-0 shadow-xl shadow-gray-200/50 dark:shadow-none",
        }}
      >
        <CardBody className="p-6">
          <SearchForm
            onSearch={handleSearch}
            isLoading={isLoading}
            knowledgeBase={knowledgeBase}
            onKnowledgeBaseChange={setKnowledgeBase}
          />
        </CardBody>
      </Card>

      {error && (
        <Alert
          color="danger"
          variant="flat"
          className="mb-6 border border-red-200 dark:border-red-800"
          title="搜索出错"
          description={error}
        />
      )}

      {hasSearched && !isLoading && !error && (
        <SearchResults results={results} query={query} total={total} />
      )}

      {!hasSearched && !isLoading && (
        <div className="text-center py-16">
          <div className="empty-icon inline-block">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center shadow-lg shadow-blue-200/50 dark:shadow-none">
              <svg
                className="h-10 w-10 text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
          <h3 className="mt-5 text-base font-semibold text-gray-700 dark:text-gray-300">
            输入关键词开始搜索文档
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            支持语义搜索，可以用自然语言描述您要查找的内容
          </p>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-16">
          <div className="inline-block">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 flex items-center justify-center">
              <Spinner size="lg" color="primary" />
            </div>
          </div>
          <p className="mt-5 text-gray-500 dark:text-gray-400 font-medium">
            正在搜索...
          </p>
        </div>
      )}
    </div>
  );
}
