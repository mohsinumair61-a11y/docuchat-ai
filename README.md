# DocuChat AI

A Retrieval-Augmented Generation (RAG) application that lets you upload a PDF document and ask questions about its content through a simple chat interface — answers are grounded in the document itself, not the model's general training data.

## How it works

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  PDF Upload │ ──▶ │  Chunking &  │ ──▶ │  In-Memory     │
│  (frontend) │     │  Embedding   │     │  Vector Store  │
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
                     └──────────────┘
```

1. **Upload** — a PDF is uploaded via `/upload`, text is extracted with `pypdf`.
2. **Chunk & embed** — the text is split into ~500-character chunks (`RecursiveCharacterTextSplitter`) and embedded using Gemini's `text-embedding-004` model.
3. **Store** — embeddings are held in an in-memory vector store (`InMemoryVectorStore` from `langchain-core`) for the life of the server process.
4. **Query** — a question triggers a similarity search (top-k chunks), which are passed as context to Gemini (`gemini-3.6-flash`) with a prompt that instructs it to answer *only* from the retrieved context.
5. **Answer** — the response, along with the source document name, is returned to the chat UI.

## Tech stack

- **Backend:** FastAPI
- **RAG orchestration:** LangChain
- **Vector store:** In-memory (LangChain `InMemoryVectorStore`) — pure Python, no compiled dependencies, so it installs identically on Windows/macOS/Linux with no build tools required
- **LLM & embeddings:** Google Gemini (`gemini-3.6-flash`, `text-embedding-004`)
- **PDF parsing:** pypdf
- **Frontend:** minimal vanilla JS chat UI (no build step required)

## Running locally

```bash
# 1. Clone and enter the project
git clone https://github.com/mohsinumair61-a11y/docuchat-ai.git
cd docuchat-ai

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set your Gemini API key (free tier available)
cp .env.example .env
# then edit .env and add your key from https://aistudio.google.com/apikey

# 4. Run the server
uvicorn src.main:app --reload

# 5. Open the chat UI
# http://localhost:8000/app
```

## API endpoints

| Method | Endpoint     | Description                                  |
|--------|--------------|-----------------------------------------------|
| GET    | `/health`    | Health check + current document count         |
| POST   | `/upload`    | Upload a PDF file to be embedded and indexed   |
| POST   | `/documents` | Add raw text directly (no file needed)         |
| POST   | `/query`     | Ask a question, get an answer + source list    |
| GET    | `/stats`     | Total chunks currently stored                  |

Interactive API docs available at `/docs` once running.

## Design notes

- **Chunk size (500) / overlap (50)** — tuned as a starting point balancing retrieval precision against enough surrounding context per chunk. Larger chunks reduce fragmentation of ideas but dilute similarity search precision.
- **Grounded prompting** — the system prompt explicitly tells the model to answer only from retrieved context and say so when it can't, which is the main lever for reducing hallucination in a RAG pipeline (versus just hoping the model "figures it out").
- **k=3 retrieval** — configurable in `rag.py`; higher k means more context per answer but higher token cost and more risk of irrelevant chunks diluting the answer.
- **In-memory vector store instead of Chroma** — Chroma depends on `hnswlib`, a C++ extension that must be compiled on install. That fails on Windows without Microsoft's C++ Build Tools, and no prebuilt wheel exists yet for the newest Python releases. Swapping to LangChain's pure-Python `InMemoryVectorStore` removes that fragility entirely at the cost of persistence across restarts — a reasonable trade-off for a demo project. Swapping to Chroma, FAISS, or a hosted store (Pinecone, Weaviate) for production persistence is a contained change scoped to `embeddings.py` and `rag.py` only.

## Running tests

```bash
pytest tests/
```

## Credits

Built on the structure of [iamtxena/simple-rag-chatbot](https://github.com/iamtxena/simple-rag-chatbot), rebuilt with Google Gemini instead of OpenAI, extended with real PDF upload support (`/upload` + `document_loader.py`) and a working chat frontend.
