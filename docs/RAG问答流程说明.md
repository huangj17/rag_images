# RAG 智能问答系统流程说明

## 概述

本系统采用 **RAG (Retrieval-Augmented Generation)** 架构，结合向量检索与大语言模型，实现基于文档知识库的智能问答功能。

## 系统架构

```mermaid
graph TB
    subgraph 前端
        A[用户输入] --> B[ChatPage组件]
        B --> C[SSE流式请求]
    end

    subgraph 后端
        C --> D[FastAPI /api/chat]
        D --> E[ChatService]
    end

    subgraph 核心服务
        E --> F[Milvus向量数据库]
        E --> G[Embedding模型<br/>本地Ollama]
        E --> H[LLM大语言模型<br/>Ollama云]
    end

    subgraph 输出
        E --> I[SSE流式响应]
        I --> J[前端打字机效果]
    end
```

## 完整问答流程

```mermaid
flowchart TD
    Start([用户发送问题]) --> A{是否为简单问候语?}

    A -->|是| B[返回预设问候回复]
    B --> End1([结束])

    A -->|否| C[结合历史上下文增强查询]
    C --> D[向量检索相关文档]

    D --> E{检索到文档?}
    E -->|否| F[返回无相关内容提示]
    F --> End2([结束])

    E -->|是| G[计算平均相似度分数]
    G --> H{平均分数 ≥ 0.75?}

    H -->|是| I[跳过LLM评估<br/>直接使用文档]
    H -->|否| J[调用LLM评估文档相关性]

    J --> K{文档相关?}
    K -->|是| L[准备生成回答]

    K -->|否| M{重写次数 < 1?}
    M -->|是| N[LLM重写问题]
    N --> D

    M -->|否| L
    I --> L

    L --> O[发送源文档信息]
    O --> P[LLM流式生成回答]
    P --> Q[返回SSE流式事件]
    Q --> End3([结束])
```

## 核心模块详解

### 1. 问候语快速响应

系统内置常见问候语识别，避免不必要的 RAG 流程：

```mermaid
graph LR
    A[用户输入] --> B{正则匹配}
    B -->|你好/Hi/Hello| C[返回欢迎语]
    B -->|谢谢/Thanks| D[返回礼貌回复]
    B -->|好的/OK| E[返回确认回复]
    B -->|其他| F[进入RAG流程]
```

**支持的问候语模式**：

- 中文：你好、早上好、下午好、晚上好、谢谢、好的、知道了
- 英文：Hi、Hello、Thanks、OK

### 2. 向量检索流程

```mermaid
sequenceDiagram
    participant U as 用户问题
    participant E as Embedding模型
    participant M as Milvus
    participant R as 检索结果

    U->>E: 发送查询文本
    E->>E: 生成查询向量 (dim=2560)
    E->>M: 向量相似度搜索
    M->>M: 计算余弦相似度
    M->>R: 返回Top-K文档
    R->>R: 包含: text, score, source_file, section
```

### 3. 文档相关性评估

```mermaid
flowchart TD
    A[检索结果] --> B[计算平均相似度分数]
    B --> C{avg_score ≥ 0.75?}

    C -->|是| D[高置信度<br/>跳过LLM评估]
    C -->|否| E[调用LLM评估]

    E --> F[发送评估Prompt]
    F --> G[LLM返回 yes/no]
    G --> H{判断结果}

    H -->|yes| I[文档相关]
    H -->|no| J[文档不相关]

    D --> I
```

**评估 Prompt 模板**：

```
你是一名评审员，需要判断检索到的文档与用户问题的相关性。

检索到的文档：
{context}

用户问题：{question}

请判断文档是否与问题相关。只需回答 'yes' 或 'no'。
```

### 4. 问题重写机制

当文档相关性评估为"不相关"时，系统会尝试重写问题：

```mermaid
flowchart LR
    A[原始问题] --> B[LLM重写]
    B --> C[优化后的问题]
    C --> D[重新检索]

    style B fill:#f9f,stroke:#333,stroke-width:2px
```

**重写 Prompt 模板**：

```
请审视输入内容，并尽量推理其潜在的语义意图。
这是最初的问题：
{question}
请将其改写为更优的问题，只输出改写后的问题。
```

### 5. 回答生成流程

```mermaid
sequenceDiagram
    participant C as ChatService
    participant L as LLM
    participant F as 前端

    C->>F: 发送 start 事件
    C->>F: 发送 sources 事件 (引用来源)

    loop 流式生成
        C->>L: 发送生成Prompt
        L-->>C: 返回token片段
        C->>F: 发送 token 事件
    end

    C->>F: 发送 end 事件
```

**生成 Prompt 模板**：

```
你是一名专业的问答助手。请利用以下检索到的上下文片段来回答问题。
如果上下文中没有相关信息，就直接说你不知道，不要编造答案。
回答要详细、准确，并尽可能引用原文内容。

上下文：
{context}

问题：{question}

回答：
```

## SSE 事件类型

| 事件类型  | 说明     | 数据内容 |
| --------- | -------- | -------- |
| `start`   | 开始处理 | 无       |
| `token`   | 回答片段 | 文本内容 |
| `sources` | 引用来源 | 文档列表 |
| `end`     | 处理完成 | 无       |
| `error`   | 发生错误 | 错误信息 |

## 性能优化策略

```mermaid
graph TD
    subgraph 启动时初始化
        A[Milvus连接]
        B[Embedding模型]
        C[LLM模型]
    end

    subgraph 运行时优化
        D[问候语快速响应<br/>跳过整个RAG流程]
        E[高置信度检索<br/>跳过LLM评估]
        F[减少重写次数<br/>最多1次]
    end

    subgraph 效果
        G[首次请求无冷启动]
        H[简单问题毫秒响应]
        I[减少LLM调用次数]
    end

    A & B & C --> G
    D --> H
    E & F --> I
```

### 优化前后对比

| 场景         | 优化前         | 优化后             |
| ------------ | -------------- | ------------------ |
| 首次请求     | 需要初始化连接 | 服务启动时已初始化 |
| "你好"       | 6 次 LLM 调用  | 0 次 LLM 调用      |
| 高相似度问题 | 必须 LLM 评估  | 跳过评估           |
| 低相关度问题 | 最多 2 次重写  | 最多 1 次重写      |

## 多轮对话支持

```mermaid
sequenceDiagram
    participant U as 用户
    participant S as 系统
    participant H as 历史记录

    U->>S: 问题1: "什么是RL训练?"
    S->>H: 保存对话
    S->>U: 回答1

    U->>S: 问题2: "如何部署?"
    S->>H: 读取历史
    H->>S: 返回上下文
    S->>S: 增强查询: "结合RL训练上下文,如何部署?"
    S->>U: 回答2
```

**历史上下文模板**：

```
以下是之前的对话历史，请结合历史上下文理解当前问题：

用户：什么是RL训练?
助手：RL训练是...

当前问题：如何部署?
```

## 错误处理与降级

```mermaid
flowchart TD
    A[LLM流式调用] --> B{成功?}
    B -->|是| C[返回流式内容]
    B -->|否| D[尝试非流式调用]

    D --> E{成功?}
    E -->|是| F[返回完整内容]
    E -->|否| G[生成降级回答]

    G --> H[基于检索结果<br/>生成摘要式回答]
```

## 技术栈

| 组件       | 技术选型       | 说明                   |
| ---------- | -------------- | ---------------------- |
| 后端框架   | FastAPI        | 异步支持，SSE 流式响应 |
| 向量数据库 | Milvus         | 高性能向量检索         |
| Embedding  | Ollama (本地)  | 文本向量化，dim=2560   |
| LLM        | Ollama (云)    | gpt-oss:120b           |
| 前端框架   | React + HeroUI | 现代化 UI 组件         |
| 状态管理   | React Hooks    | 简洁高效               |

## 文件结构

```
backend/
├── app/
│   ├── api/endpoints/
│   │   └── chat.py          # Chat API 端点
│   ├── services/
│   │   ├── chat_service.py  # RAG 核心逻辑
│   │   └── milvus/
│   │       └── client.py    # Milvus + LLM 客户端
│   └── main.py              # 应用入口 + 生命周期管理

frontend/
├── app/
│   ├── components/
│   │   └── ChatPage.tsx     # 聊天界面组件
│   └── lib/
│       └── api.ts           # API 客户端 + SSE 处理
```
