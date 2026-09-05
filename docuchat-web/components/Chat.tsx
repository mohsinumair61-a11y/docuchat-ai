"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, Copy, Menu, MessageSquare, RotateCcw, Sparkles, Square, X,
} from "lucide-react";
import Answer from "@/components/Answer";
import Composer from "@/components/Composer";
import History from "@/components/History";
import Library from "@/components/Library";
import PhaseIndicator from "@/components/Phase";
import Sources from "@/components/Sources";
import { readEvents } from "@/lib/stream";
import { id, useConversations } from "@/hooks/useConversations";
import type { Capabilities } from "@/lib/api";
import type {
  ApiError, Citation, Message, Phase, QueryResponse, StatsResponse,
} from "@/types/docuchat";

const STARTERS = [
  "What is the main objective of this document?",
  "Summarise the key points.",
  "What deadlines are mentioned?",
];

export default function Chat({
  initialChunks,
  capabilities,
}: {
  initialChunks: number | null;
  capabilities: Capabilities;
}) {
  const {
    conversations, active, activeId, loaded,
    setActiveId, setMessages, startNew, remove,
  } = useConversations();

  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<number | null>(initialChunks);
  const [copied, setCopied] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const messages = active?.messages ?? [];

  // Follow new content, but stop following the moment the user scrolls up —
  // otherwise reading an earlier answer while one streams is impossible.
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stick.current) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, phase]);

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) return;
      setChunks(((await res.json()) as StatsResponse).total_chunks);
    } catch {
      /* stats are cosmetic */
    }
  }, []);

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setPhase("idle");
  }, []);

  const ask = useCallback(
    async (question: string, replaceLast = false) => {
      const trimmed = question.trim();
      if (!trimmed || phase !== "idle") return;

      setError(null);
      setDraft("");
      stick.current = true;

      // Ids are generated here, not inside the updater below. React may run an
      // updater more than once, and an updater that invents a new id each time
      // is not a pure function of its input.
      const answerId = id();
      const questionId = id();
      const now = Date.now();

      setMessages((prev) => {
        const base = replaceLast ? prev.slice(0, -1) : prev;
        return [
          ...base,
          ...(replaceLast
            ? []
            : [{ id: questionId, role: "user" as const, content: trimmed, createdAt: now }]),
          { id: answerId, role: "assistant" as const, content: "", createdAt: now },
        ];
      });

      // Prior turns give the model enough to resolve follow-ups. Only sent when
      // the backend says it accepts them.
      const history = capabilities.history
        ? messages.slice(-6).map((m) => ({ role: m.role, content: m.content }))
        : undefined;

      const controller = new AbortController();
      abort.current = controller;
      setPhase("retrieving");

      const patch = (fn: (m: Message) => Message) =>
        setMessages((prev) => prev.map((m) => (m.id === answerId ? fn(m) : m)));

      try {
        if (capabilities.streaming) {
          const res = await fetch("/api/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: trimmed, history }),
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            const d = (await res.json().catch(() => null)) as ApiError | null;
            throw new Error(d?.detail ?? "The request failed");
          }

          let text = "";
          for await (const ev of readEvents(res.body, controller.signal)) {
            if (ev.type === "retrieval") {
              setPhase("writing");
              patch((m) => ({
                ...m,
                citations: ev.citations as Citation[],
                retrievedChunks: ev.retrieved_chunks,
              }));
            } else if (ev.type === "token") {
              text += ev.text;
              patch((m) => ({ ...m, content: text }));
            } else if (ev.type === "done") {
              patch((m) => ({ ...m, sources: ev.sources }));
            } else if (ev.type === "error") {
              throw new Error(ev.detail);
            }
          }
        } else {
          // Older backend: one round trip, no stream.
          const to = setTimeout(() => setPhase("writing"), 700);
          const res = await fetch("/api/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: trimmed }),
            signal: controller.signal,
          });
          clearTimeout(to);

          const data: QueryResponse | ApiError = await res.json();
          if (!res.ok) throw new Error((data as ApiError).detail);

          const ok = data as QueryResponse;
          patch((m) => ({
            ...m,
            content: ok.answer,
            sources: ok.sources,
            citations: ok.citations,
            retrievedChunks: ok.retrieved_chunks,
          }));
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          patch((m) => ({ ...m, content: m.content || "Stopped." }));
        } else {
          const detail = err instanceof Error ? err.message : "Something went wrong";
          setError(detail);
          patch((m) => ({ ...m, error: detail }));
        }
      } finally {
        abort.current = null;
        setPhase("idle");
      }
    },
    [phase, messages, capabilities, setMessages],
  );

  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) void ask(lastUser.content, true);
  }, [messages, ask]);

  // Cmd/Ctrl+K starts a new chat, Escape stops a running answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        startNew();
      }
      if (e.key === "Escape" && phase !== "idle") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startNew, stop, phase]);

  const busy = phase !== "idle";

  const sidebar = (
    <div className="space-y-5">
      <History
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          setDrawer(false);
        }}
        onNew={() => {
          startNew();
          setDrawer(false);
        }}
        onRemove={remove}
      />

      <div>
        <h2 className="text-[0.8125rem] font-semibold text-ink">Knowledge base</h2>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-body">
          Answers come only from what you upload here.
        </p>
      </div>

      <Library
        canList={capabilities.document_list}
        canDelete={capabilities.delete}
        onChanged={() => void refreshStats()}
        onError={setError}
      />

      {chunks !== null ? (
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="font-mono text-[0.6875rem] text-muted">Indexed</p>
          <p className="mt-1 text-[0.9375rem] font-medium text-ink">
            {chunks.toLocaleString()} chunks
          </p>
        </div>
      ) : null}
    </div>
  );

  if (!loaded) {
    return <div className="h-[34rem] animate-pulse rounded-2xl border border-line bg-surface" />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-8">
      {/* Mobile drawer */}
      <button
        type="button"
        onClick={() => setDrawer(true)}
        className="flex items-center gap-2 self-start rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[0.875rem] text-body lg:hidden"
      >
        <Menu className="h-4 w-4" strokeWidth={2} />
        Documents & history
      </button>

      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close"
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-y-0 left-0 w-[19rem] max-w-[85%] overflow-y-auto bg-canvas p-5 scroll-thin">
            <button
              type="button"
              onClick={() => setDrawer(false)}
              aria-label="Close"
              className="mb-4 rounded-md p-1.5 text-muted hover:text-ink"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <aside className="hidden lg:sticky lg:top-8 lg:block lg:self-start">{sidebar}</aside>

      {/* Conversation */}
      <section className="flex min-h-[34rem] flex-col rounded-2xl border border-line bg-surface">
        <div ref={pane} className="flex-1 space-y-5 overflow-y-auto p-5 scroll-thin sm:p-7">
          {messages.length === 0 && phase === "idle" ? (
            <div className="flex h-full min-h-[22rem] flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft">
                <MessageSquare className="h-5 w-5 text-brand" strokeWidth={1.9} />
              </div>
              <h2 className="mt-5 text-[1.125rem] font-semibold text-ink">
                {chunks && chunks > 0 ? "Ready when you are" : "Upload a document to begin"}
              </h2>
              <p className="mt-2 max-w-sm text-[0.875rem] leading-relaxed text-body">
                {chunks && chunks > 0
                  ? "Ask anything about what you uploaded. Every answer shows the passage it came from."
                  : "Add a PDF, then ask questions about it in plain language."}
              </p>

              <div className="mt-7 w-full max-w-sm space-y-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void ask(s)}
                    className="w-full rounded-xl border border-line px-4 py-3 text-left text-[0.875rem] text-body transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-deep"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={m.id} className="rise flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[0.9375rem] text-canvas">
                  {m.content}
                </p>
              </div>
            ) : (
              <article key={m.id} className="rise rounded-2xl border-l-2 border-brand bg-canvas p-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand">
                    <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.2} />
                  </span>
                  <span className="font-mono text-[0.6875rem] text-muted">DocuChat</span>
                </div>

                {m.error ? (
                  <p className="mt-3 text-[0.9375rem] text-danger">{m.error}</p>
                ) : (
                  <Answer streaming={busy && i === messages.length - 1}>{m.content}</Answer>
                )}

                <Sources
                  sources={m.sources ?? []}
                  citations={m.citations}
                  chunks={m.retrievedChunks}
                />

                {!busy && m.content ? (
                  <div className="mt-3 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(m.content);
                        setCopied(m.id);
                        setTimeout(() => setCopied(null), 1600);
                      }}
                      className="inline-flex items-center gap-1.5 text-[0.75rem] text-muted transition-colors hover:text-ink"
                    >
                      <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                      {copied === m.id ? "Copied" : "Copy"}
                    </button>
                    {i === messages.length - 1 ? (
                      <button
                        type="button"
                        onClick={retry}
                        className="inline-flex items-center gap-1.5 text-[0.75rem] text-muted transition-colors hover:text-ink"
                      >
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                        Regenerate
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ),
          )}

          {phase === "retrieving" ? <PhaseIndicator phase={phase} /> : null}

          {error ? (
            <div
              role="alert"
              className="rise flex items-start gap-3 rounded-xl border border-warn/25 bg-warn/8 px-4 py-3"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warn" strokeWidth={2} />
              <p className="flex-1 text-[0.875rem] text-body">{error}</p>
              <button
                type="button"
                onClick={retry}
                className="shrink-0 text-[0.8125rem] font-medium text-warn hover:underline"
              >
                Retry
              </button>
            </div>
          ) : null}

          <div ref={end} />
        </div>

        <div className="border-t border-line-soft p-4 sm:p-5">
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void ask(draft)}
            disabled={busy}
          />
          <div className="mt-2.5 flex items-center justify-center gap-4">
            {busy ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex items-center gap-1.5 text-[0.75rem] text-muted transition-colors hover:text-ink"
              >
                <Square className="h-3 w-3 fill-current" strokeWidth={0} />
                Stop generating
              </button>
            ) : (
              <p className="text-center text-[0.75rem] text-muted">
                Answers come from your documents. If it isn&rsquo;t in them,
                DocuChat says so.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
