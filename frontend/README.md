# 前端（React Router 7）使用说明

基于 React Router 7 构建的管理与检索界面，提供知识库管理、文档解析入库、向量检索与对话等能力。

## 功能概览

- 知识库管理：创建、查看、跳转上传页，校验 `collection_name` 合法性。
- 文档上传解析：上传单文件，查看分片与统计，可选是否直接入向量库，失败自动兜底索引一次。
- 检索与对话：支持多知识库搜索、聊天流式回答，并展示命中片段来源。
- 健康检查与提示：调用后端 `/api/health` 反馈 Milvus 连接状态。

## 环境要求

- Node.js ≥ 20
- 推荐使用 pnpm（仓库已提供 `pnpm-lock.yaml`）
- 后端接口默认指向 `http://localhost:8010`，可在 `app/lib/api.ts` 调整 `API_BASE_URL`

## 本地开发

```bash
cd frontend
pnpm install
pnpm dev
# 默认端口 http://localhost:5173，需要后端先运行在 8010 端口
```

## 构建与运行

```bash
pnpm build          # 产物位于 build/client 与 build/server
pnpm start          # 使用 react-router-serve 启动已构建的服务端入口
```

## Docker（可选）

```bash
docker build -t rag-frontend .
docker run --rm -p 3000:3000 rag-frontend
```

如需自定义后端地址，请在构建镜像前修改 `app/lib/api.ts` 中的 `API_BASE_URL`。

## 关键路径

- UI 入口：`app/routes/index.tsx`、`app/routes/home.tsx`
- 知识库上传流程：`app/routes/knowledge-base-upload.tsx`
- API 封装：`app/lib/api.ts`
