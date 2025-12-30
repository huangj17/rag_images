import {
  Alert,
  Button,
  Card,
  CardBody,
  Chip,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Textarea,
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeBases,
  updateKnowledgeBase,
  type KnowledgeBase,
} from "../lib/api";

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function slugify(input: string) {
  const s = input
    .trim()
    .toLowerCase()
    // Milvus collection 只能包含字母/数字/下划线
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return s || `kb_${Date.now()}`;
}

export function KnowledgeBaseList() {
  const navigate = useNavigate();
  const [items, setItems] = useState<KnowledgeBase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [selected, setSelected] = useState<KnowledgeBase | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [collectionName, setCollectionName] = useState("");

  const sortedItems = useMemo(() => {
    return [...items].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [items]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listKnowledgeBases();
      setItems(res.items);
      return res.items;
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取知识库列表失败");
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openCreate = () => {
    setName("");
    setDescription("");
    setCollectionName("");
    setIsCreateOpen(true);
  };

  const openEdit = (kb: KnowledgeBase) => {
    setSelected(kb);
    setName(kb.name);
    setDescription(kb.description || "");
    setCollectionName(kb.collection_name);
    setIsEditOpen(true);
  };

  const openDelete = (kb: KnowledgeBase) => {
    setSelected(kb);
    setIsDeleteOpen(true);
  };

  const handleCreate = async () => {
    const n = name.trim();
    const c = collectionName.trim() || `kb_${slugify(n)}`;
    if (!n) {
      setError("知识库名称不能为空");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const createdKb = await createKnowledgeBase({
        name: n,
        description: description.trim() ? description.trim() : undefined,
        collection_name: c,
      });
      setIsCreateOpen(false);
      await refresh();
      navigate(`/knowledge-bases/${createdKb.id}/upload`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建知识库失败");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!selected) return;
    const n = name.trim();

    if (!n) {
      setError("知识库名称不能为空");
      return;
    }

    setUpdating(true);
    setError(null);
    try {
      await updateKnowledgeBase(selected.id, {
        name: n,
        description: description.trim() ? description.trim() : "",
      });
      setIsEditOpen(false);
      setSelected(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新知识库失败");
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;

    setDeleting(true);
    setError(null);
    try {
      await deleteKnowledgeBase(selected.id);
      setIsDeleteOpen(false);
      setSelected(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除知识库失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            知识库管理
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            管理知识库元数据（名称/描述）并映射到 Milvus collection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="flat"
            onPress={refresh}
            isDisabled={isLoading}
            className="bg-gray-100 dark:bg-gray-800"
          >
            刷新
          </Button>
          <Button
            color="primary"
            onPress={openCreate}
            className="bg-linear-to-r from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/25"
          >
            新建知识库
          </Button>
        </div>
      </div>

      {error && (
        <Alert
          color="danger"
          variant="flat"
          className="border border-red-200 dark:border-red-800"
          title="操作失败"
          description={error}
        />
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <Spinner size="lg" color="primary" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            正在加载知识库...
          </p>
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          暂无知识库，点击右上角“新建知识库”创建。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedItems.map((kb) => (
            <div
              key={kb.id}
              role="link"
              tabIndex={0}
              className="outline-none"
              onClick={() => navigate(`/knowledge-bases/${kb.id}/upload`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/knowledge-bases/${kb.id}/upload`);
                }
              }}
            >
              <Card
                shadow="sm"
                className="hover-lift border-0 cursor-pointer"
                classNames={{
                  base: "bg-white dark:bg-gray-900 shadow-lg shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800",
                }}
              >
                <CardBody className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-gray-800 dark:text-gray-100 truncate">
                        {kb.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {kb.collection_name}
                      </div>
                    </div>
                    <Chip
                      size="sm"
                      classNames={{
                        base: "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800",
                        content:
                          "text-emerald-600 dark:text-emerald-400 font-medium text-xs",
                      }}
                    >
                      {kb.document_count} 条目
                    </Chip>
                  </div>

                  {kb.description ? (
                    <div className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                      {kb.description}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">（无描述）</div>
                  )}

                  <Divider className="opacity-60" />

                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <div>创建时间：{formatDateTime(kb.created_at)}</div>
                    <div>更新时间：{formatDateTime(kb.updated_at)}</div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      color="secondary"
                      variant="flat"
                      onPress={() =>
                        navigate(`/knowledge-bases/${kb.id}/upload`)
                      }
                      onClick={(e) => e.stopPropagation()}
                    >
                      进入上传解析
                    </Button>
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => openEdit(kb)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      color="danger"
                      variant="flat"
                      onPress={() => openDelete(kb)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      删除
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* 新建 */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        backdrop="blur"
        size="lg"
      >
        <ModalContent>
          <ModalHeader>新建知识库</ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              label="名称"
              value={name}
              onValueChange={setName}
              placeholder="例如：产品手册"
              isRequired
            />
            <Textarea
              label="描述"
              value={description}
              onValueChange={setDescription}
              placeholder="可选，用于说明该知识库内容"
              minRows={3}
            />
            <Input
              label="Milvus Collection"
              value={collectionName}
              onValueChange={setCollectionName}
              placeholder={name.trim() ? `kb_${slugify(name)}` : "kb_xxx"}
              description="为空时会根据名称自动生成"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsCreateOpen(false)}>
              取消
            </Button>
            <Button
              color="primary"
              onPress={handleCreate}
              isLoading={creating}
              spinner={<Spinner size="sm" color="white" />}
              className="bg-linear-to-r from-blue-500 to-indigo-500"
            >
              创建
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 编辑 */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        backdrop="blur"
        size="lg"
      >
        <ModalContent>
          <ModalHeader>编辑知识库</ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              label="名称"
              value={name}
              onValueChange={setName}
              isRequired
            />
            <Textarea
              label="描述"
              value={description}
              onValueChange={setDescription}
              minRows={3}
            />
            <Input
              label="Milvus Collection"
              value={collectionName}
              isDisabled
              description="collection 不支持修改（避免与已索引数据错配）"
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsEditOpen(false)}>
              取消
            </Button>
            <Button
              color="primary"
              onPress={handleUpdate}
              isLoading={updating}
              spinner={<Spinner size="sm" color="white" />}
              className="bg-linear-to-r from-blue-500 to-indigo-500"
            >
              保存
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认 */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        backdrop="blur"
        size="lg"
      >
        <ModalContent>
          <ModalHeader>确认删除</ModalHeader>
          <ModalBody>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
              <div>
                将删除知识库：
                <span className="font-semibold"> {selected?.name}</span>
              </div>
              <div>
                同时会尝试删除对应 Milvus collection：
                <code className="px-1">{selected?.collection_name}</code>
              </div>
              <div className="text-red-500 dark:text-red-400">
                该操作不可恢复。
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsDeleteOpen(false)}>
              取消
            </Button>
            <Button
              color="danger"
              onPress={handleDelete}
              isLoading={deleting}
              spinner={<Spinner size="sm" color="white" />}
            >
              删除
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
