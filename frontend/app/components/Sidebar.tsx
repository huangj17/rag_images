import { Button, Chip, Tooltip } from "@heroui/react";
import { NavLink } from "react-router";
import type { HealthResponse } from "../lib/api";

interface MenuItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  health: HealthResponse | null;
  healthError: string | null;
}

const menuItems: MenuItem[] = [
  {
    to: "/chat",
    label: "智能问答",
    icon: (
      <svg
        className="w-5 h-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
  },
  {
    to: "/search",
    label: "文档搜索",
    icon: (
      <svg
        className="w-5 h-5"
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
    ),
  },
  {
    to: "/knowledge-bases",
    label: "知识库管理",
    icon: (
      <svg
        className="w-5 h-5"
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
    ),
  },
];

export function Sidebar({
  isCollapsed,
  onToggleCollapse,
  health,
  healthError,
}: SidebarProps) {
  return (
    <aside
      className={`sidebar-container ${
        isCollapsed ? "sidebar-collapsed" : "sidebar-expanded"
      }`}
    >
      {/* Logo 区域 */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="w-10 h-10 min-w-[40px] rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <svg
              className="w-5 h-5 text-white"
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
          </div>
          <div className="sidebar-logo-text">
            <h1 className="text-lg font-bold gradient-text">RAG 图文搜索</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              智能文档检索
            </p>
          </div>
        </div>
      </div>

      {/* 菜单区域 */}
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const menuButton = (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-menu-item ${
                  isActive ? "sidebar-menu-item-active" : ""
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`sidebar-menu-icon ${
                      isActive ? "sidebar-menu-icon-active" : ""
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="sidebar-menu-label">{item.label}</span>
                </>
              )}
            </NavLink>
          );

          if (isCollapsed) {
            return (
              <Tooltip key={item.to} content={item.label} placement="right">
                {menuButton}
              </Tooltip>
            );
          }

          return menuButton;
        })}
      </nav>

      {/* 底部区域 */}
      <div className="sidebar-footer">
        {/* 连接状态 */}
        <div
          className={`sidebar-status ${isCollapsed ? "justify-center" : ""}`}
        >
          {healthError ? (
            isCollapsed ? (
              <Tooltip content="服务离线" placement="right">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              </Tooltip>
            ) : (
              <Chip
                color="danger"
                variant="flat"
                size="sm"
                classNames={{
                  base: "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800",
                  content: "text-red-600 dark:text-red-400 font-medium text-xs",
                }}
                startContent={
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                }
              >
                服务离线
              </Chip>
            )
          ) : health ? (
            isCollapsed ? (
              <Tooltip
                content={
                  health.milvus_connected ? "Milvus 已连接" : "Milvus 未连接"
                }
                placement="right"
              >
                <span
                  className={`w-3 h-3 rounded-full ${
                    health.milvus_connected ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
              </Tooltip>
            ) : (
              <Chip
                color={health.milvus_connected ? "success" : "warning"}
                variant="flat"
                size="sm"
                classNames={{
                  base: health.milvus_connected
                    ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
                    : "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800",
                  content: health.milvus_connected
                    ? "text-emerald-600 dark:text-emerald-400 font-medium text-xs"
                    : "text-amber-600 dark:text-amber-400 font-medium text-xs",
                }}
                startContent={
                  <span
                    className={`w-2 h-2 rounded-full ${
                      health.milvus_connected
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    }`}
                  />
                }
              >
                {health.milvus_connected ? "Milvus 已连接" : "Milvus 未连接"}
              </Chip>
            )
          ) : isCollapsed ? (
            <Tooltip content="检查中..." placement="right">
              <span className="w-3 h-3 rounded-full bg-gray-400 pulse-soft" />
            </Tooltip>
          ) : (
            <Chip
              color="default"
              variant="flat"
              size="sm"
              classNames={{
                base: "bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
                content: "text-gray-500 dark:text-gray-400 text-xs",
              }}
              startContent={
                <span className="w-2 h-2 rounded-full bg-gray-400 pulse-soft" />
              }
            >
              检查中...
            </Chip>
          )}
        </div>

        {/* 折叠按钮 */}
        <Tooltip
          content={isCollapsed ? "展开菜单" : "收起菜单"}
          placement="right"
        >
          <Button
            isIconOnly
            variant="light"
            size="sm"
            onPress={onToggleCollapse}
            className="sidebar-collapse-btn"
          >
            <svg
              className={`w-5 h-5 transition-transform duration-300 ${
                isCollapsed ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </Button>
        </Tooltip>
      </div>
    </aside>
  );
}
