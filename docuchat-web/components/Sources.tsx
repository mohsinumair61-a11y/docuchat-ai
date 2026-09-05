"use client";

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import type { Citation } from "@/types/docuchat";

/**
 * The citation strip under an answer.
 *
 * When the backend returns full citations, each chip expands to show the exact
 * passage the answer was built from. That is the difference between claiming an
 * answer is grounded and letting the reader check it.
 *
 * Older backends return only `sources` as strings, so the component falls back
 * to plain chips with nothing to expand.
 */
export default function Sources({
  sources,
  citations,
  chunks,
}: {
  sources: string[];
  citations?: Citation[];
  chunks?: number;
}) {
  const [open, setOpen] = useState(false);

  // The old build seeded two sample docs into the index; they are not the
  // user's content and never belong in a citation.
  const cites = (citations ?? []).filter((c) => c.source !== "sample_data");
  const plain = sources.filter((s) => s !== "sample_data");

  if (cites.length === 0 && plain.length === 0) return null;

  const labels =
    cites.length > 0
      ? cites.map((c) => (c.page ? `${c.source} · p.${c.page}` : c.source))
      : plain;

  return (
    <div className="mt-4 border-t border-line-soft pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[0.625rem] uppercase tracking-wide text-muted">
          {labels.length === 1 ? "Source" : "Sources"}
        </span>

        {labels.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-cite-soft px-2 py-1 font-mono text-[0.6875rem] text-cite"
          >
            <FileText className="h-3 w-3" strokeWidth={2} />
            {label}
          </span>
        ))}

        {typeof chunks === "number" && chunks > 0 ? (
          <span className="font-mono text-[0.6875rem] text-muted">
            {chunks} passage{chunks === 1 ? "" : "s"} retrieved
          </span>
        ) : null}

        {cites.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto inline-flex items-center gap-1 text-[0.75rem] text-muted transition-colors hover:text-ink"
          >
            {open ? "Hide" : "View"} source text
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              strokeWidth={2}
            />
          </button>
        ) : null}
      </div>

      {open ? (
        <ul className="mt-3 space-y-2">
          {cites.map((c, i) => (
            <li
              key={`${c.source}-${c.chunk_index}-${i}`}
              className="rounded-lg border border-line bg-raised p-3.5"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[0.6875rem] text-cite">
                  {c.source}
                  {c.page ? ` · page ${c.page}` : ""}
                </span>
                {typeof c.chunk_index === "number" ? (
                  <span className="font-mono text-[0.625rem] text-muted">
                    chunk {c.chunk_index}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-body">
                {c.text}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
