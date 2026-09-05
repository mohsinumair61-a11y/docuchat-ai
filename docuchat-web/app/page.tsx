import { Sparkles } from "lucide-react";
import Chat from "@/components/Chat";
import ThemeToggle from "@/components/ThemeToggle";
import { getCapabilities, getStats } from "@/lib/api";

// Stats and capabilities are read on the server on every request, so the header
// shows real state on first paint rather than after a client round trip.
export const dynamic = "force-dynamic";

export default async function Page() {
  let chunks: number | null = null;
  let model: string | null = null;

  try {
    const stats = await getStats();
    chunks = stats.total_chunks;
    model = stats.model;
  } catch {
    // Backend down at render time. Chat still mounts and retries client-side.
  }

  const capabilities = await getCapabilities();

  return (
    <div className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand">
            <Sparkles className="h-5 w-5 text-white" strokeWidth={2} />
          </span>
          <div>
            <h1 className="text-[1.0625rem] font-semibold tracking-tight text-ink">
              DocuChat AI
            </h1>
            <p className="text-[0.8125rem] text-body">
              Ask questions grounded in your documents
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {capabilities.streaming ? (
            <span className="rounded-full bg-brand-soft px-3 py-1.5 font-mono text-[0.6875rem] text-brand-deep">
              streaming
            </span>
          ) : null}
          {model ? (
            <span className="rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-[0.6875rem] text-muted">
              {model}
            </span>
          ) : null}
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[0.6875rem] ${
              chunks === null ? "bg-warn/12 text-warn" : "bg-brand-soft text-brand-deep"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                chunks === null ? "bg-warn" : "live bg-brand"
              }`}
            />
            {chunks === null ? "backend offline" : "connected"}
          </span>
          <ThemeToggle />
        </div>
      </header>

      <Chat initialChunks={chunks} capabilities={capabilities} />
    </div>
  );
}
