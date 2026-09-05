"""
DocuChat AI - FastAPI Application

A Retrieval-Augmented Generation (RAG) chatbot that lets users upload
documents (PDF or plain text) and ask questions grounded in their content.
"""
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Literal, Optional
import os
from dotenv import load_dotenv
load_dotenv()

from .rag import RAGEngine
from .embeddings import setup_vector_store
from .document_loader import extract_text_from_pdf

try:
    # Optional: added alongside add_pages() so citations can carry a page
    # number. If the loader has not been updated, upload falls back to
    # whole-document indexing and pages stay null.
    from .document_loader import extract_pages_from_pdf
except ImportError:
    extract_pages_from_pdf = None

rag_engine: Optional[RAGEngine] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the RAG engine on startup.

    Nothing is seeded into the index. Sample documents used to be added here,
    but they were retrieved alongside real content, appeared as citations on
    genuine answers, and inflated the chunk count.
    """
    global rag_engine
    vector_store = setup_vector_store()
    rag_engine = RAGEngine(vector_store)
    yield


app = FastAPI(
    title="DocuChat AI",
    description="A RAG-powered document Q&A assistant",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def engine() -> RAGEngine:
    if not rag_engine:
        raise HTTPException(status_code=500, detail="RAG engine not initialized")
    return rag_engine


# --------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------- #

class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    max_tokens: Optional[int] = 500
    k: Optional[int] = 3
    history: Optional[list[HistoryTurn]] = None


class Citation(BaseModel):
    source: str
    page: Optional[int] = None
    chunk_index: Optional[int] = None
    text: str


class QueryResponse(BaseModel):
    answer: str
    sources: list[str]
    retrieved_chunks: int
    citations: list[Citation] = []


class DocumentRequest(BaseModel):
    text: str
    metadata: Optional[dict] = None


class IndexedDocument(BaseModel):
    source: str
    chunks: int
    characters: int
    page_count: Optional[int] = None


# --------------------------------------------------------------------- #
# Basics
# --------------------------------------------------------------------- #

@app.get("/")
async def root():
    return {"message": "DocuChat AI API", "docs": "/docs", "health": "/health"}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "model": os.getenv("MODEL_NAME", "models/gemini-3.6-flash"),
        "documents_loaded": rag_engine.get_document_count() if rag_engine else 0
    }


@app.get("/capabilities")
async def capabilities():
    """
    What this build supports, so a client can feature-detect instead of
    guessing from version numbers.
    """
    return {
        "streaming": True,
        "citations": True,
        "history": True,
        "document_list": True,
        "delete": True,
        "page_numbers": extract_pages_from_pdf is not None,
    }


# --------------------------------------------------------------------- #
# Querying
# --------------------------------------------------------------------- #

@app.post("/query", response_model=QueryResponse)
async def query_chatbot(request: QueryRequest):
    """Ask a question grounded in the currently uploaded documents."""
    rag = engine()
    try:
        result = rag.query(
            request.question,
            k=request.k or 3,
            max_tokens=request.max_tokens,
            history=[t.model_dump() for t in request.history] if request.history else None,
        )
        return QueryResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@app.post("/query/stream")
async def query_stream(request: QueryRequest):
    """
    Same as /query, streamed as Server-Sent Events.

    Each line is `data: {json}\\n\\n`. Event types, in order: `retrieval`,
    then many `token`, then `done`. An `error` event can replace the tail if
    generation fails partway through — the client should surface it rather
    than leaving a half-written answer looking complete.
    """
    rag = engine()

    def events():
        try:
            stream = rag.query_stream(
                request.question,
                k=request.k or 3,
                history=[t.model_dump() for t in request.history] if request.history else None,
            )
            for event in stream:
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            # Stops nginx buffering the stream into one lump on deploy
            "X-Accel-Buffering": "no",
        },
    )


# --------------------------------------------------------------------- #
# Documents
# --------------------------------------------------------------------- #

@app.post("/documents")
async def add_document(request: DocumentRequest):
    """Add raw text directly to the vector store (no file required)."""
    rag = engine()
    try:
        rag.add_document(request.text, request.metadata or {})
        return {"message": "Document added successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add document: {str(e)}")


@app.get("/documents", response_model=list[IndexedDocument])
async def list_documents():
    """Everything currently queryable, grouped by source file."""
    return engine().list_documents()


@app.delete("/documents/{source}")
async def delete_document(source: str):
    """Remove one source and all of its chunks from the index."""
    removed = engine().delete_source(source)
    if removed == 0:
        raise HTTPException(status_code=404, detail=f"No document named '{source}'")
    return {"message": f"Removed '{source}'", "chunks_removed": removed}


@app.delete("/documents")
async def clear_documents():
    """Empty the index."""
    return {"message": "Index cleared", "chunks_removed": engine().clear()}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF file — its text is extracted, chunked, and embedded
    so it becomes queryable through /query."""
    rag = engine()

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    try:
        file_bytes = await file.read()

        # Page-aware indexing when the loader supports it, so citations can
        # say which page an answer came from.
        if extract_pages_from_pdf is not None:
            pages = extract_pages_from_pdf(file_bytes)
            characters = sum(len(p) for p in pages)
            if characters == 0:
                raise HTTPException(status_code=422, detail="No extractable text found in PDF")
            rag.add_pages(pages, {"source": file.filename})
        else:
            text = extract_text_from_pdf(file_bytes)
            if not text.strip():
                raise HTTPException(status_code=422, detail="No extractable text found in PDF")
            characters = len(text)
            rag.add_document(text, {"source": file.filename})

        return {
            "message": f"'{file.filename}' processed and added to the knowledge base",
            "characters_extracted": characters,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")


@app.get("/stats")
async def get_stats():
    rag = engine()
    return {
        "total_chunks": rag.get_document_count(),
        "model": os.getenv("MODEL_NAME", "models/gemini-3.6-flash")
    }


# Serve the minimal chat frontend at /app
app.mount("/app", StaticFiles(directory="frontend", html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
