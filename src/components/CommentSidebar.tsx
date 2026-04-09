import { MessageSquarePlus, Trash2 } from "lucide-react";
import type { Annotation } from "../types";

type CommentSidebarProps = {
  annotations: Annotation[];
  selectedId: string | null;
  readOnly?: boolean;
  onSelect: (id: string) => void;
  onUpdateComment: (id: string, comment: string) => void;
  onDelete: (id: string) => void;
};

export function CommentSidebar({
  annotations,
  selectedId,
  readOnly = false,
  onSelect,
  onUpdateComment,
  onDelete
}: CommentSidebarProps) {
  return (
    <aside className="w-80 border-l border-slate-300 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <MessageSquarePlus size={18} className="text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-700">修正コメント一覧</h2>
      </div>

      {annotations.length === 0 && (
        <p className="px-4 py-5 text-sm text-slate-500">
          左の画面をドラッグして修正枠を作成すると、ここにコメント欄が追加されます。
        </p>
      )}

      <div className="max-h-[calc(100vh-12rem)] space-y-4 overflow-y-auto p-4">
        {annotations.map((item, idx) => (
          <div
            key={item.id}
            className={`rounded border p-3 ${
              selectedId === item.id
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                className="text-left text-sm font-semibold text-slate-700"
                onClick={() => onSelect(item.id)}
              >
                #{idx + 1} のコメント
              </button>
              <button
                type="button"
                className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600"
                onClick={() => onDelete(item.id)}
                disabled={readOnly}
                aria-label={`コメント ${idx + 1} を削除`}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <textarea
              value={item.comment}
              onChange={(event) => onUpdateComment(item.id, event.target.value)}
              onFocus={() => onSelect(item.id)}
              readOnly={readOnly}
              className="h-24 w-full resize-none rounded border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
              placeholder={readOnly ? "閲覧専用です" : "修正内容を入力"}
            />
            <p className="mt-2 text-xs text-slate-500">
              x:{Math.round(item.x)} y:{Math.round(item.y)} / w:{Math.round(item.width)} h:
              {Math.round(item.height)}
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}
