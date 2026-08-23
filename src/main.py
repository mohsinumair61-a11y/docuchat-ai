"""
DocuChat AI - FastAPI Application

A Retrieval-Augmented Generation (RAG) chatbot that lets users upload
documents (PDF or plain text) and ask questions grounded in their content.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import os
from dotenv import load_dotenv
load_dotenv()

from .rag import RAGEngine
from .embeddings import setup_vector_store
from .document_loader import extract_text_from_pdf

rag_engine: Optional[RAGEngine] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the RAG engine on startup with a couple of sample facts
    so the API is queryable immediately, even before a document is uploaded."""
    global rag_engine
    vector_store = setup_vector_store()
    rag_engine = RAGEngine(vector_store)

    sample_docs = [
        "DocuChat AI is a Retrieval-Augmented Generation (RAG) application that "
        "lets users upload PDF documents and ask questions about their content.",
        "Upload a PDF using the /upload endpoint, then ask questions via /query.",
    ]
    for doc in sample_docs:
        rag_engine.add_document(doc, {"source": "sample_data"})

    yield


app = FastAPI(
    title="DocuChat AI",
    description="A RAG-powered document Q&A assistant",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    question: str
    max_tokens: Optional[int] = 500


class QueryResponse(BaseModel):
    answer: str
    sources: list[str]
    retrieved_chunks: int


class DocumentRequest(BaseModel):
    text: str
    metadata: Optional[dict] = None


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


@app.post("/query", response_model=QueryResponse)
async def query_chatbot(request: QueryRequest):
    """Ask a question grounded in the currently uploaded documents."""
    if not rag_engine:
        raise HTTPException(status_code=500, detail="RAG engine not initialized")

    try:
        result = rag_engine.query(request.question, max_tokens=request.max_tokens)
        return QueryResponse(
            answer=result["answer"],
            sources=result["sources"],
            retrieved_chunks=result.get("retrieved_chunks", 0)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@app.post("/documents")
async def add_document(request: DocumentRequest):
    """Add raw text directly to the vector store (no file required)."""
    if not rag_engine:
        raise HTTPException(status_code=500, detail="RAG engine not initialized")

    try:
        rag_engine.add_document(request.text, request.metadata or {})
        return {"message": "Document added successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add document: {str(e)}")


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF file — its text is extracted, chunked, and embedded
    so it becomes queryable through /query."""
    if not rag_engine:
        raise HTTPException(status_code=500, detail="RAG engine not initialized")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    try:
        file_bytes = await file.read()
        text = extract_text_from_pdf(file_bytes)

        if not text.strip():
            raise HTTPException(status_code=422, detail="No extractable text found in PDF")

        rag_engine.add_document(text, {"source": file.filename})
        return {
            "message": f"'{file.filename}' processed and added to the knowledge base",
            "characters_extracted": len(text)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")


@app.get("/stats")
async def get_stats():
    if not rag_engine:
        raise HTTPException(status_code=500, detail="RAG engine not initialized")

    return {
        "total_chunks": rag_engine.get_document_count(),
        "model": os.getenv("MODEL_NAME", "models/gemini-3.6-flash")
    }


# Serve the minimal chat frontend at /app
app.mount("/app", StaticFiles(directory="frontend", html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
