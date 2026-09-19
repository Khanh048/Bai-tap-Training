"use client";

import { useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { ActionScope, Activity } from "@/lib/types";

interface ScopeDialogProps {
  activity: Activity | null;
  onClose: () => void;
  onConfirm: (scope: ActionScope) => Promise<void>;
}

interface ScopeChoice {
  scope: ActionScope;
  title: string;
  description: string;
}

export function ScopeDialog({ activity, onClose, onConfirm }: ScopeDialogProps) {
  const [busy, setBusy] = useState<ActionScope | null>(null);
  const [error, setError] = useState("");

  if (!activity) {
    return null;
  }

  const choices: ScopeChoice[] = activity.series_id
    ? [
        {
          scope: "single",
          title: "Chỉ buổi này",
          description: "Các buổi khác vẫn giữ nguyên.",
        },
        {
          scope: "future",
          title: "Buổi này và các buổi sau",
          description: "Những buổi trước đây không thay đổi.",
        },
        {
          scope: "all",
          title: "Toàn bộ chuỗi",
          description: "Xoá tất cả buổi trong lịch lặp.",
        },
      ]
    : [
        {
          scope: "single",
          title: "Xoá hoạt động",
          description: "Thao tác này không thể hoàn tác.",
        },
      ];

  async function confirm(scope: ActionScope) {
    setBusy(scope);
    setError("");

    try {
      await onConfirm(scope);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Chưa thể xoá hoạt động.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      closeDisabled={Boolean(busy)}
      title="Bạn muốn xoá phạm vi nào?"
      description={activity.title}
      size="sm"
    >
      <div className="space-y-2">
        {choices.map((choice) => (
          <button
            key={choice.scope}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void confirm(choice.scope)}
            className="flex w-full items-center gap-3 rounded-2xl border border-sage-200 p-4 text-left hover:border-red-300 hover:bg-red-50 disabled:cursor-wait disabled:opacity-70"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-700">
              {busy === choice.scope ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <Trash2 size={18} />
              )}
            </span>
            <span>
              <strong className="block text-sm text-ink-900">
                {choice.title}
              </strong>
              <span className="mt-1 block text-xs text-ink-500">
                {choice.description}
              </span>
            </span>
          </button>
        ))}

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
