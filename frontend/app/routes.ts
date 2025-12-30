import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/home.tsx", [
    index("routes/index.tsx"),
    route("chat", "routes/chat.tsx"),
    route("search", "routes/search.tsx"),
    route("knowledge-bases", "routes/knowledge-bases.tsx"),
    route("knowledge-bases/:kbId/upload", "routes/knowledge-base-upload.tsx"),
  ]),
] satisfies RouteConfig;
