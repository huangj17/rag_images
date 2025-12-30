import { Card, CardBody } from "@heroui/react";
import { useOutletContext } from "react-router";
import { ChatPage } from "../components/ChatPage";
import type { AppOutletContext } from "./home";

export default function ChatRoute() {
  const { knowledgeBase, setKnowledgeBase } =
    useOutletContext<AppOutletContext>();

  return (
    <div className="content-container h-[calc(100vh-2rem)] flex flex-col">
      <Card
        className="flex-1 min-h-0 glass-card"
        shadow="lg"
        classNames={{
          base: "border-0 shadow-xl shadow-gray-200/50 dark:shadow-none",
        }}
      >
        <CardBody className="p-0 h-full">
          <ChatPage
            className="h-full"
            knowledgeBase={knowledgeBase}
            onKnowledgeBaseChange={setKnowledgeBase}
          />
        </CardBody>
      </Card>
    </div>
  );
}
