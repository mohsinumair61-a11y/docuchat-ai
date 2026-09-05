"use client";

import { MessageSquarePlus, Trash2 } from "lucide-react";
import type { Conversation } from "@/types/docuchat";

export default function History({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRemove,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onNew}
        className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[0.875rem] font-medium text-ink transition-colors hover:border-brand hover:text-brand-deep"
      >
        <MessageSquarePlus className="h-4 w-4" strokeWidth={2} />
        New chat
      </button>

      {conversations.length > 1 ? (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto scroll-thin">
          {conversations.map((c) => (
            <li key={c.id}>
              <div
                className={`group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                  c.id === activeId ? "bg-brand-soft" : "hover:bg-raised"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={`min-w-0 flex-1 truncate text-left text-[0.8125rem] ${
                    c.id === activeId ? "text-brand-deep" : "text-body"
                  }`}
                  title={c.title}
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(c.id)}
                  aria-label={`Delete ${c.title}`}
                  className="shrink-0 rounded p-1 text-muted opacity-0 transition-all hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
