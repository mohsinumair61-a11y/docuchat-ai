"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import type { ApiError, UploadResponse } from "@/types/docuchat";
import type { IndexedDocument } from "@/lib/api";

/**
 * The indexed document list, read from the backend rather than tracked in
 * component state — so it survives a refresh and shows what is actually
 * queryable, not just what this browser tab happened to upload.
 */
export default function Library({
  canList,
  canDelete,
  onChanged,
  onError,
}: {
  canList: boolean;
  canDelete: boolean;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<IndexedDocument[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const refresh = useCallback(async () => {
    if (!canList) return;
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) return;
      setDocs((await res.json()) as IndexedDocument[]);
    } catch {
      /* the list is informational; a failure here is not worth an alert */
    }
  }, [canList]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function upload(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data: UploadResponse | ApiError = await res.json();

        if (!res.ok) {
          onError(`${file.name}: ${(data as ApiError).detail}`);
          continue;
        }
        await refresh();
        onChanged();
      } catch {
        onError(`${file.name}: upload failed. Is the backend running?`);
      } finally {
        setUploading(null);
      }
    }
    if (input.current) input.current.value = "";
  }

  async function remove(source: string) {
    setRemoving(source);
    try {
      const res = await fetch(`/api/documents?source=${encodeURIComponent(source)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = (await res.json()) as ApiError;
        onError(d.detail);
        return;
      }
      await refresh();
      onChanged();
    } catch {
      onError("Could not remove the document.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        className={`rounded-xl border border-dashed p-4 text-center transition-colors ${
          dragging ? "border-brand bg-brand-soft" : "border-line bg-surface"
        }`}
      >
        <input
          ref={input}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
          }}
        />
        <button
          type="button"
          disabled={uploading !== null}
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[0.875rem] font-medium text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              Indexing…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" strokeWidth={2} />
              Upload PDFs
            </>
          )}
        </button>
        <p className="mt-2 text-[0.75rem] text-muted">
          {uploading ? uploading : "or drop them here · PDF, up to 20 MB each"}
        </p>
      </div>

      {canList && docs.length > 0 ? (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li
              key={d.source}
              className="group flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3"
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] font-medium text-ink" title={d.source}>
                  {d.source}
                </p>
                <p className="font-mono text-[0.6875rem] text-muted">
                  {d.chunks} chunk{d.chunks === 1 ? "" : "s"}
                  {d.page_count ? ` · ${d.page_count} pages` : ""}
                </p>
              </div>
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => void remove(d.source)}
                  disabled={removing === d.source}
                  aria-label={`Remove ${d.source}`}
                  className="shrink-0 rounded-md p-1.5 text-muted opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  {removing === d.source ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  )}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
