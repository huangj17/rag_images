import { Alert, Button, Card, CardBody, Spinner } from "@heroui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { FileUpload } from "../components/FileUpload";
import { ParseResults } from "../components/ParseResults";
import {
  getKnowledgeBase,
  indexChunks,
  uploadDocument,
  type DocumentChunk,
  type KnowledgeBase,
  type ParseStatistics,
} from "../lib/api";

function isValidCollectionName(name: string) {
  return /^[A-Za-z0-9_]+$/.test(name);
}

export default function KnowledgeBaseUploadRoute() {
  const navigate = useNavigate();
  const { kbId } = useParams();

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [kbError, setKbError] = useState<string | null>(null);
  const [kbLoading, setKbLoading] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<{
    chunks: DocumentChunk[];
    statistics: ParseStatistics;
    fileName: string;
  } | null>(null);
  const [storeToVector, setStoreToVector] = useState(true);
  const autoIndexAttemptedRef = useRef(false);

  useEffect(() => {
    if (!kbId) return;
    let cancelled = false;
    (async () => {
      setKbLoading(true);
      setKbError(null);
      try {
        const data = await getKnowledgeBase(kbId);
        if (!cancelled) setKb(data);
      } catch (e) {
        if (!cancelled)
          setKbError(e instanceof Error ? e.message : "获取知识库失败");
      } finally {
        if (!cancelled) setKbLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kbId]);

  const title = useMemo(() => {
    if (kb) return `上传解析：${kb.name}`;
    return "上传解析";
  }, [kb]);

  // 每次有新的解析结果时，允许自动索引尝试一次
  useEffect(() => {
    autoIndexAttemptedRef.current = false;
  }, [kb?.id, parseResult?.fileName]);

  const handleUpload = async (file: File, storeToVector: boolean) => {
    if (!kb) return;
    if (storeToVector && !isValidCollectionName(kb.collection_name)) {
      setUploadError(
        `当前知识库的 collection_name 不合法（仅允许字母/数字/下划线）：${kb.collection_name}`
      );
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    setParseResult(null);

    try {
      const response = await uploadDocument(
        file,
        storeToVector,
        storeToVector ? kb.collection_name : undefined
      );
      setParseResult({
        chunks: response.chunks,
        statistics: response.statistics,
        fileName: file.name,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传解析失败");
    } finally {
      setIsUploading(false);
    }
  };

  // 兜底：如果勾选了“入库”但上传返回未入库，则自动索引一次（避免还要手动点按钮）
  useEffect(() => {
    if (!storeToVector) return;
    if (!kb) return;
    if (!parseResult) return;
    if (parseResult.statistics.stored_to_vector) return;
    if (!isValidCollectionName(kb.collection_name)) return;
    if (autoIndexAttemptedRef.current) return;
    autoIndexAttemptedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const resp = await indexChunks({
          chunks: parseResult.chunks,
          collection_name: kb.collection_name,
        });
        if (!resp.success) throw new Error(resp.message || "索引失败");
        if (cancelled) return;
        setParseResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            statistics: {
              ...prev.statistics,
              stored_to_vector: true,
              indexed_count: resp.indexed_count,
              collection_name: kb.collection_name,
            } as ParseStatistics,
          };
        });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "自动索引失败";
        // 记录到 statistics，ParseResults 会显示 warning
        setParseResult((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            statistics: {
              ...prev.statistics,
              vector_store_error: msg,
            },
          };
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kb, parseResult, storeToVector]);

  return (
    <div className="content-container">
      <header className="content-header">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="content-title">{title}</h2>
            <p className="content-description">
              {kb
                ? `目标知识库：${kb.name}（${kb.collection_name}）`
                : "正在加载知识库..."}
            </p>
          </div>
          <Button variant="flat" onPress={() => navigate("/knowledge-bases")}>
            返回知识库列表
          </Button>
        </div>
      </header>

      {kbError && (
        <Alert
          color="danger"
          variant="flat"
          className="mb-6 border border-red-200 dark:border-red-800"
          title="加载失败"
          description={kbError}
        />
      )}

      {kb && !isValidCollectionName(kb.collection_name) && (
        <Alert
          color="danger"
          variant="flat"
          className="mb-6 border border-red-200 dark:border-red-800"
          title="知识库配置不合法"
          description={`该知识库的 collection_name 含非法字符（仅允许字母/数字/下划线）：${kb.collection_name}。请新建一个知识库（collection 建议用下划线），或删除该知识库后重建。`}
        />
      )}

      <Card
        className="mb-6 glass-card"
        shadow="lg"
        classNames={{
          base: "border-0 shadow-xl shadow-gray-200/50 dark:shadow-none",
        }}
      >
        <CardBody className="p-6">
          {kbLoading ? (
            <div className="text-center py-12">
              <Spinner size="lg" color="secondary" />
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                正在加载知识库...
              </p>
            </div>
          ) : (
            <FileUpload
              onUpload={handleUpload}
              isUploading={isUploading}
              knowledgeBase={kb}
              onKnowledgeBaseChange={() => {}}
              defaultStoreToVector={true}
              requireKnowledgeBase={true}
              showKnowledgeBaseSelector={false}
              storeToVector={storeToVector}
              onStoreToVectorChange={setStoreToVector}
              // collection_name 不合法时禁用上传（否则会导致后端反复报错）
              isDisabledExternally={
                kb ? !isValidCollectionName(kb.collection_name) : true
              }
            />
          )}
        </CardBody>
      </Card>

      {uploadError && (
        <Alert
          color="danger"
          variant="flat"
          className="mb-6 border border-red-200 dark:border-red-800"
          title="上传失败"
          description={uploadError}
        />
      )}

      {parseResult && !isUploading && (
        <ParseResults
          chunks={parseResult.chunks}
          statistics={parseResult.statistics}
          fileName={parseResult.fileName}
          collectionName={kb?.collection_name}
        />
      )}
    </div>
  );
}
