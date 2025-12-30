import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router";
import { AdminLayout } from "../components/AdminLayout";
import {
  checkHealth,
  type HealthResponse,
  type KnowledgeBase,
} from "../lib/api";

export type AppOutletContext = {
  knowledgeBase: KnowledgeBase | null;
  setKnowledgeBase: (kb: KnowledgeBase | null) => void;
};

export default function AppLayoutRoute() {
  // 知识库选择（用于搜索/上传/问答）
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase | null>(
    null
  );

  // 健康状态
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await checkHealth();
      setHealth(data);
      setHealthError(null);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : "连接失败");
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    // 仅初始化时请求一次，避免前端“心跳”轮询刷屏后端日志
    fetchHealth();
  }, [fetchHealth]);

  return (
    <AdminLayout health={health} healthError={healthError}>
      <Outlet
        context={{ knowledgeBase, setKnowledgeBase } satisfies AppOutletContext}
      />
    </AdminLayout>
  );
}
