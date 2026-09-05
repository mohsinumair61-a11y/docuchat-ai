# DocuChat AI — web frontend

Next.js 15 (App Router) + TypeScript frontend for the DocuChat FastAPI backend.

```bash
npm install
cp .env.example .env.local     # point DOCUCHAT_API_URL at your FastAPI server
npm run dev                    # http://localhost:3000
```

Backend runs separately:

```bash
uvicorn src.main:app --reload  # http://localhost:8000
```

## What it does

- **Streams answers token by token** over SSE, with a caret trailing the text
- **Citations you can open** — each answer shows the exact passages it was
  built from, with page numbers
- **Document library** read from the backend — upload several PDFs at once,
  delete any of them, see chunk and page counts
- **Conversation history** in the sidebar, persisted locally, with follow-up
  questions carrying prior turns as context
- **Dark mode** with system detection and no flash on load
- **Stop and regenerate** mid-answer
- **Mobile drawer** for the sidebar
- `Cmd/Ctrl+K` new chat, `Esc` stop, `Enter` send, `Shift+Enter` newline

## Feature detection, not version guessing

`GET /capabilities` tells the frontend what this backend supports. If the
endpoint 404s — an older build — every optional feature reports off and the UI
falls back: no streaming, plain string sources, no document list. Nothing
breaks, it just does less.

That is why `Chat.tsx` has two code paths for asking a question, and why
`Sources.tsx` renders either rich citations or plain chips.

## Why every call goes through a route handler

The browser never talks to FastAPI directly. `DOCUCHAT_API_URL` is read
server-side only, so:

- the backend address stays private and can sit behind a firewall
- an API key can be added later without touching client code
- input is validated once, before it reaches the RAG engine

`app/api/stream/route.ts` forwards the upstream body rather than awaiting it —
buffering there would defeat the point of streaming.

## Architecture

```
app/
  page.tsx              server component — reads /stats and /capabilities
  layout.tsx            inline theme script, runs before paint
  api/
    stream/route.ts     pipes SSE straight through
    query/route.ts      non-streaming fallback
    upload/route.ts     size and type checks
    documents/route.ts  list and delete
    stats|capabilities
components/
  Chat.tsx              conversation state, streaming, retry, stop
  Answer.tsx            markdown rendering + streaming caret
  Sources.tsx           citation chips, expandable passage text
  Library.tsx           upload, list, delete
  History.tsx           conversation sidebar
  Composer.tsx          auto-growing textarea
  Phase.tsx             retrieval indicator
  ThemeToggle.tsx
hooks/
  useTheme.ts           light / dark / system
  useConversations.ts   history in localStorage
lib/
  api.ts                typed server-side client
  stream.ts             hand-written SSE parser
types/
  docuchat.ts           request and response interfaces
```

**Server components** render the shell and read state before first paint.
**Client components** own everything interactive.

No `any` anywhere. `ApiRequestError` carries the HTTP status through so the UI
can tell a validation failure from an unreachable backend.

### The SSE reader

`lib/stream.ts` is written by hand rather than using `EventSource`, because
that API only does GET and the question has to go in a POST body. The buffer
handling matters: a network chunk can land mid-event, so anything after the
last complete `\n\n` is held until the next read.

### Scroll behaviour

The pane follows new tokens, but stops the moment the user scrolls up. Without
that, reading an earlier answer while a new one streams is impossible.

## Backend changes this expects

See `BACKEND.md`. The frontend runs against the old backend too — it just
loses streaming, page numbers, the document list and delete.

## Known limits

- **In-memory index.** `InMemoryVectorStore` loses everything on restart. A
  persistent store (Chroma on disk, pgvector) is the fix.
- **Conversation history is per-browser.** The backend is stateless by design;
  history lives in `localStorage`. Multi-device sync would need a database.
- **No auth.** Anyone who can reach the app can read and delete every document.

## Deploying

```bash
npx vercel
```

Set `DOCUCHAT_API_URL` in the Vercel project's environment variables. It stays
server-side — it is not prefixed `NEXT_PUBLIC_`.
