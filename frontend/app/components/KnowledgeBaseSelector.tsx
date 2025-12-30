import { Button, Select, SelectItem, Spinner } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listKnowledgeBases, type KnowledgeBase } from "../lib/api";

interface KnowledgeBaseSelectorProps {
  value: KnowledgeBase | null;
  onChange: (kb: KnowledgeBase | null) => void;
  isDisabled?: boolean;
  label?: string;
  className?: string;
}

export function KnowledgeBaseSelector({
  value,
  onChange,
  isDisabled,
  label = "知识库",
  className,
}: KnowledgeBaseSelectorProps) {
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listKnowledgeBases();
      setItems(res.items);

      // 若当前未选择，则默认选第一个（通常是“默认知识库”）
      if (!value && res.items.length > 0) {
        onChange(res.items[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取知识库失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [onChange, value]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectedKeys = useMemo(() => {
    if (!value) return [];
    // 避免传入不存在的 key，触发组件 warning
    return items.some((x) => x.id === value.id) ? [value.id] : [];
  }, [items, value]);

  return (
    <div className={`flex items-end gap-2 ${className || ""}`.trim()}>
      <div className="flex-1">
        <Select
          label={label}
          name="knowledge_base"
          selectedKeys={selectedKeys}
          onSelectionChange={(keys) => {
            const id = Array.from(keys)[0];
            const kb = items.find((x) => x.id === id) || null;
            onChange(kb);
          }}
          size="sm"
          variant="bordered"
          isDisabled={isDisabled || loading || items.length === 0}
          classNames={{
            trigger:
              "min-h-12 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors rounded-xl",
            label: "text-gray-500 dark:text-gray-400",
            value: "text-gray-700 dark:text-gray-300 font-medium",
          }}
          description={error ? `加载失败：${error}` : undefined}
        >
          {items.map((kb) => (
            <SelectItem key={kb.id} textValue={kb.name}>
              {kb.name}
            </SelectItem>
          ))}
        </Select>
      </div>

      <Button
        isIconOnly
        size="md"
        variant="flat"
        onPress={refresh}
        isDisabled={isDisabled || loading}
        aria-label="刷新知识库列表"
        className="w-12 h-12 min-w-12 bg-gray-100 dark:bg-gray-800"
      >
        {loading ? (
          <Spinner size="sm" color="default" />
        ) : (
          <RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        )}
      </Button>
    </div>
  );
}
