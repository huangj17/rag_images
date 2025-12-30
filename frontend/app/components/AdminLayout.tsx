import { useEffect, useState } from "react";
import type { HealthResponse } from "../lib/api";
import { Sidebar } from "./Sidebar";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

interface AdminLayoutProps {
  children: React.ReactNode;
  health: HealthResponse | null;
  healthError: string | null;
}

export function AdminLayout({
  children,
  health,
  healthError,
}: AdminLayoutProps) {
  // SSR 期间固定初始值，避免 hydration mismatch；挂载后再从 localStorage 同步
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 移除初始 class，让 React 接管状态
  useEffect(() => {
    document.documentElement.classList.remove("sidebar-collapsed-initial");
  }, []);

  // 客户端挂载后读取 localStorage
  useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      setIsCollapsed(v === "true");
    } catch {
      // ignore
    }
  }, []);

  const handleToggleCollapse = () => {
    const newValue = !isCollapsed;
    setIsCollapsed(newValue);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newValue));
  };

  return (
    <div className="admin-layout">
      <Sidebar
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
        health={health}
        healthError={healthError}
      />
      <main
        className={`admin-content ${
          isCollapsed ? "admin-content-expanded" : ""
        }`}
      >
        {children}
      </main>
    </div>
  );
}
