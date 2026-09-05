import { PenLine, Search } from "lucide-react";
import type { Phase } from "@/types/docuchat";

/**
 * Shows retrieval and generation as two visible steps. The backend answers in
 * one round trip, so these are timed on the client — retrieval is what happens
 * first inside RAGEngine.query, and surfacing it makes the grounding visible
 * instead of implied.
 */
export default function PhaseIndicator({ phase }: { phase: Phase }) {
  if (phase === "idle") return null;

  const steps = [
    {
      key: "retrieving" as const,
      icon: Search,
      label: "Searching your documents",
      sub: "Finding the passages that relate to your question",
    },
    {
      key: "writing" as const,
      icon: PenLine,
      label: "Writing the answer",
      sub: "Using only what was retrieved",
    },
  ];

  return (
    <div className="rise space-y-2">
      {steps.map((s) => {
        const done = phase === "writing" && s.key === "retrieving";
        const active = phase === s.key;
        if (!done && !active) return null;

        return (
          <div
            key={s.key}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              done
                ? "border-line-soft bg-line-soft/50"
                : "border-brand/15 bg-brand-soft"
            }`}
          >
            <s.icon
              className={`h-4 w-4 shrink-0 ${done ? "text-muted" : "text-brand"}`}
              strokeWidth={2}
            />
            <div className="min-w-0">
              <p
                className={`text-[0.8125rem] font-medium ${
                  done ? "text-muted" : "text-brand-deep"
                }`}
              >
                {s.label}
              </p>
              {active ? (
                <p className="text-[0.75rem] text-body/70">{s.sub}</p>
              ) : null}
            </div>
            <span className="ml-auto shrink-0">
              {done ? (
                <span className="font-mono text-[0.6875rem] text-muted">done</span>
              ) : (
                <span className="flex gap-1">
                  <span className="dot-1 h-1.5 w-1.5 rounded-full bg-brand" />
                  <span className="dot-2 h-1.5 w-1.5 rounded-full bg-brand" />
                  <span className="dot-3 h-1.5 w-1.5 rounded-full bg-brand" />
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
