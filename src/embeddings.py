"""
Vector Store Setup - Initialize an in-memory vector store with Google Gemini embeddings

Uses LangChain's InMemoryVectorStore rather than Chroma. Chroma depends on
hnswlib, a C++ extension that needs to be compiled on install - this fails
out of the box on Windows without Microsoft's C++ Build Tools, and on some
Python versions no prebuilt wheel exists at all. InMemoryVectorStore is pure
Python, so it installs and runs identically on every platform with zero
native build dependencies - a reasonable trade-off for a project like this,
since the store doesn't need to persist across restarts. Swapping back to
Chroma (or a hosted store like Pinecone) later is a small, contained change
scoped entirely to this file.
"""
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_google_genai import GoogleGenerativeAIEmbeddings


def setup_vector_store() -> InMemoryVectorStore:
    """
    Initialize an in-memory vector store with Google Gemini embeddings.

    Returns:
        InMemoryVectorStore: Initialized vector store
    """
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001"
    )

    return InMemoryVectorStore(embeddings)


def get_embedding_model_info() -> dict:
    """Get information about the embedding model in use."""
    return {
        "model": "models/text-embedding-004",
        "provider": "Google Gemini",
        "dimensions": 768
    }
