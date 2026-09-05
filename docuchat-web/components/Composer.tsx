"use client";

import { useRef, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";

export default function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);

  function grow() {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (disabled || !value.trim()) return;
    onSubmit();
    if (ta.current) ta.current.style.height = "auto";
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm focus-within:border-brand"
    >
      <label htmlFor="question" className="sr-only">
        Ask a question about your documents
      </label>
      <textarea
        id="question"
        ref={ta}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder="Ask something about your document…"
        onChange={(e) => {
          onChange(e.target.value);
          grow();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) submit(e);
        }}
        className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-muted disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send question"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-deep disabled:opacity-35"
      >
        <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
      </button>
    </form>
  );
}
