import { Card, CardBody } from "@heroui/react";
import { KnowledgeBaseList } from "../components/KnowledgeBaseList";

export default function KnowledgeBasesRoute() {
  return (
    <div className="content-container">
      <header className="content-header">
        <h2 className="content-title">知识库管理</h2>
        <p className="content-description">
          创建、编辑、删除知识库，并将其映射到不同的向量集合
        </p>
      </header>

      <Card
        className="glass-card"
        shadow="lg"
        classNames={{
          base: "border-0 shadow-xl shadow-gray-200/50 dark:shadow-none",
        }}
      >
        <CardBody className="p-6">
          <KnowledgeBaseList />
        </CardBody>
      </Card>
    </div>
  );
}
