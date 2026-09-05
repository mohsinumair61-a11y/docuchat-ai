# DocuChat AI

A Retrieval-Augmented Generation (RAG) application that lets you upload PDF documents and ask questions about their content — answers are grounded in the documents themselves, not the model's general training data, and every answer cites the page it came from.

## How it works

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  PDF Upload │ ──▶ │  Page-aware  │ ──▶ │  In-Memory     │
│             │     │  Chunking &  │     │  Vector Store  │
│             │     │  Embedding   │     │                │
└─────────────┘     └──────────────┘     └───────┬────────┘
                                                    │
┌─────────────┐     ┌──────────────┐              │
│  User        │ ──▶ │  Similarity  │ ◀────────────┘
│  Question    │     │  Search (k)  │
└─────────────┘     └──────┬───────┘
                            │
                     ┌──────▼───────┐
                     │  Gemini LLM  │  ← answers using only
                     │  + Prompt    │    retrieved context
                     └──────┬───────┘
                            │
                     ┌──────▼───────┐
                     │  SSE stream  │  → tokens + citations
                     └──────────────┘
```

1. **Upload** — a PDF is uploaded via `/upload`, text is extracted page by page with `pypdf`.
2. **Chunk & embed** — each page is split into ~500-character chunks (`RecursiveCharacterTextSplitter`) and embedded using Gemini's `text-embedding-004` model. Chunking happens *within* a page rather than across it, so every chunk carries a page number.
3. **Store** — embeddings are held in an in-memory vector store (`InMemoryVectorStore` from `langchain-core`) for the life of the server process.
4. **Query** — a question triggers a similarity search (top-k chunks), which are passed as context to Gemini (`gemini-3.6-flash`) with a prompt that instructs it to answer *only* from the retrieved context.
5. **Answer** — the response streams back token by token over Server-Sent Events, preceded by the citations it was built from, so the UI can show which passages are in play while the answer is still being written.

## Tech stack

**Backend**

- **API:** FastAPI
- **RAG orchestration:** LangChain
- **Vector store:** In-memory (LangChain `InMemoryVectorStore`) — pure Python, no compiled dependencies, so it installs identically on Windows/macOS/Linux with no build tools required
- **LLM & embeddings:** Google Gemini (`gemini-3.6-flash`, `text-embedding-004`)
- **PDF parsing:** pypdf

**Frontend**

- **Framework:** Next.js 15 (App Router) with TypeScript
- **Styling:** Tailwind CSS v4
- **State:** React hooks; conversation history in `localStorage`

## Two frontends

**`docuchat-web/`** — the Next.js app, and the one to use. Streaming answers, page-level citations you can expand to read the source passage, a document library with upload and delete, conversation history, and dark mode. Full details in [`docuchat-web/README.md`](docuchat-web/README.md).

**`frontend/`** — a minimal vanilla-JS page served by the API itself at `/app`. No build step. Kept as a dependency-free fallback and a reference for what the API looks like without a framework in front of it.

## Running locally

```bash
# 1. Clone and enter the project
git clone https://github.com/mohsinumair61-a11y/docuchat-ai.git
cd docuchat-ai

# 2. Install backend dependencies
pip install -r requirements.txt

# 3. Set your Gemini API key (free tier available)
cp .env.example .env
# then edit .env and add your key from https://aistudio.google.com/apikey

# 4. Run the API
uvicorn src.main:app --reload
```

The API is now on `http://localhost:8000`, with the minimal UI at `/app`.

For the Next.js frontend, in a second terminal:

```bash
cd docuchat-web
npm install
cp .env.example .env.local     # points DOCUCHAT_API_URL at http://localhost:8000
npm run dev                    # http://localhost:3000
```

The two run as separate processes. The browser only ever talks to the Next.js server, which proxies to FastAPI through route handlers in `docuchat-web/app/api` — so the API address, and any key added later, stay server-side.

## API endpoints

| Method | Endpoint                | Description                                            |
|--------|-------------------------|--------------------------------------------------------|
| GET    | `/health`               | Health check + current document count                   |
| GET    | `/capabilities`         | What this build supports, so clients can feature-detect |
| POST   | `/upload`               | Upload a PDF to be embedded and indexed                 |
| POST   | `/documents`            | Add raw text directly (no file needed)                  |
| GET    | `/documents`            | List indexed documents with chunk and page counts       |
| DELETE | `/documents/{source}`   | Remove one document and all of its chunks               |
| DELETE | `/documents`            | Empty the index                                         |
| POST   | `/query`                | Ask a question, get an answer + citations               |
| POST   | `/query/stream`         | Same, streamed as Server-Sent Events                    |
| GET    | `/stats`                | Total chunks currently stored                           |

Interactive API docs available at `/docs` once running.

### Streaming format

`/query/stream` emits one JSON object per SSE frame:

```
data: {"type":"retrieval","citations":[...],"retrieved_chunks":3}
data: {"type":"token","text":"Cloud "}
data: {"type":"token","text":"computing "}
data: {"type":"done","sources":["notes.pdf"]}
```

The `retrieval` event lands before the first token. An `error` event can replace the tail if generation fails partway through, so a half-written answer is never presented as complete.

## Design notes

- **Chunk size (500) / overlap (50)** — tuned as a starting point balancing retrieval precision against enough surrounding context per chunk. Larger chunks reduce fragmentation of ideas but dilute similarity search precision.

- **Grounded prompting** — the system prompt explicitly tells the model to answer only from retrieved context and say so when it can't, which is the main lever for reducing hallucination in a RAG pipeline (versus just hoping the model "figures it out").

- **k=3 retrieval** — configurable per request; higher k means more context per answer but higher token cost and more risk of irrelevant chunks diluting the answer.

- **Page-aware chunking** — `extract_text_from_pdf` joins every page into one string, which loses the page a passage came from; a chunk spanning a page break then has no page to point at. `extract_pages_from_pdf` returns a list instead and `add_pages` chunks within each page, which is what makes a citation like "policy.pdf, page 4" truthful rather than approximate. The whole-document path is still there, and the API falls back to it if the page-aware loader is absent.

- **Citations return passage text, not just filenames** — a filename asks the reader to take grounding on trust; returning the retrieved passage lets them check it. It costs nothing at query time, since those chunks are already in hand.

- **Streaming via SSE rather than WebSockets** — the traffic is one-directional and short-lived, so a WebSocket's bidirectional connection buys nothing and adds reconnection handling. `X-Accel-Buffering: no` is set on the response because nginx otherwise collects the whole stream and delivers it in one lump, which is indistinguishable from streaming being broken.

- **A `/capabilities` endpoint instead of version checks** — the frontend asks what this build supports and degrades when something is missing, rather than inferring from a version number. An older backend simply loses streaming, page numbers and the document list; nothing breaks.

- **In-memory vector store instead of Chroma** — Chroma depends on `hnswlib`, a C++ extension that must be compiled on install. That fails on Windows without Microsoft's C++ Build Tools, and no prebuilt wheel exists yet for the newest Python releases. Swapping to LangChain's pure-Python `InMemoryVectorStore` removes that fragility entirely at the cost of persistence across restarts — a reasonable trade-off for a demo project. Swapping to Chroma, FAISS, or a hosted store (Pinecone, Weaviate) for production persistence is a contained change scoped to `embeddings.py` and `rag.py` only.

- **Conversation history lives in the browser** — the API is stateless; every `/query` is independent. History is kept in `localStorage` by the frontend, which gives a usable transcript without a database and makes it obvious what would need to move server-side for multi-device sync.

## Running tests

```bash
pytest tests/
```

## Credits
