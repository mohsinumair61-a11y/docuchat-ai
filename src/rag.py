"""
RAG Engine - Retrieval-Augmented Generation Logic
"""
from typing import Iterator, Optional
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import ChatPromptTemplate
from langchain_core.vectorstores import InMemoryVectorStore
import os


SYSTEM_PROMPT = (
    "You are a helpful assistant answering questions strictly using "
    "the provided context from the user's uploaded documents. "
    "If the context doesn't contain relevant information, say so "
    "clearly instead of guessing."
)


class RAGEngine:
    """RAG engine for document retrieval and question answering."""

    def __init__(self, vector_store: InMemoryVectorStore):
        self.vector_store = vector_store
        self.llm = ChatGoogleGenerativeAI(
            model=os.getenv("MODEL_NAME", "models/gemini-3.6-flash"),
            temperature=0.3
        )
        # chunk_size / chunk_overlap directly affect retrieval quality:
        # smaller chunks -> more precise matches but less surrounding context per chunk.
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=int(os.getenv("CHUNK_SIZE", 500)),
            chunk_overlap=int(os.getenv("CHUNK_OVERLAP", 50))
        )

    # ------------------------------------------------------------------ #
    # Indexing
    # ------------------------------------------------------------------ #

    def add_document(self, text: str, metadata: dict = None):
        """Split a document into chunks and add each chunk to the vector store."""
        chunks = self.text_splitter.split_text(text)

        for i, chunk in enumerate(chunks):
            chunk_metadata = metadata.copy() if metadata else {}
            chunk_metadata["chunk_index"] = i
            chunk_metadata["total_chunks"] = len(chunks)

            self.vector_store.add_texts(
                texts=[chunk],
                metadatas=[chunk_metadata]
            )

    def add_pages(self, pages: list[str], metadata: dict = None):
        """
        Index a document page by page so retrieved chunks carry a page number.

        `pages` is the text of each page in order. Chunking happens within a
        page rather than across it, which is what makes a citation like
        "policy.pdf, page 4" possible — a chunk that spans a page break has no
        single correct page to point at.
        """
        for page_no, page_text in enumerate(pages, start=1):
            if not page_text.strip():
                continue

            chunks = self.text_splitter.split_text(page_text)
            for i, chunk in enumerate(chunks):
                chunk_metadata = metadata.copy() if metadata else {}
                chunk_metadata["page"] = page_no
                chunk_metadata["chunk_index"] = i
                chunk_metadata["total_chunks"] = len(chunks)

                self.vector_store.add_texts(
                    texts=[chunk],
                    metadatas=[chunk_metadata]
                )

    # ------------------------------------------------------------------ #
    # Retrieval
    # ------------------------------------------------------------------ #

    def _retrieve(self, question: str, k: int):
        """Shared retrieval step for both the blocking and streaming paths."""
        return self.vector_store.similarity_search(question, k=k)

    @staticmethod
    def _citations(docs) -> list[dict]:
        """
        Turn retrieved documents into citations the UI can render.

        Returning the passage text as well as its source is what lets the
        frontend show *why* an answer says what it says, rather than asking the
        reader to take the filename on trust.
        """
        out = []
        for doc in docs:
            meta = doc.metadata or {}
            out.append({
                "source": meta.get("source", "unknown"),
                "page": meta.get("page"),
                "chunk_index": meta.get("chunk_index"),
                "text": doc.page_content,
            })
        return out

    @staticmethod
    def _build_messages(context: str, question: str, history: Optional[list[dict]] = None):
        """
        Assemble the prompt, optionally with prior turns.

        History is capped and inserted before the current question so follow-ups
        like "and what about the second one?" resolve, without letting an
        unbounded transcript crowd out the retrieved context.
        """
        turns: list[tuple[str, str]] = [("system", SYSTEM_PROMPT)]

        for turn in (history or [])[-6:]:
            role = "assistant" if turn.get("role") == "assistant" else "user"
            content = (turn.get("content") or "").strip()
            if content:
                turns.append((role, content.replace("{", "{{").replace("}", "}}")))

        turns.append(("user", "Context:\n{context}\n\nQuestion: {question}"))

        prompt = ChatPromptTemplate.from_messages(turns)
        return prompt.format_messages(context=context, question=question)

    NO_MATCH = (
        "I couldn't find relevant information in the uploaded documents "
        "to answer that."
    )

    def query(self, question: str, k: int = 3, max_tokens: int = 500,
              history: Optional[list[dict]] = None):
        """Retrieve the top-k relevant chunks and generate a grounded answer."""
        docs = self._retrieve(question, k)

        if not docs:
            return {
                "answer": self.NO_MATCH,
                "sources": [],
                "retrieved_chunks": 0,
                "citations": [],
            }

        context = "\n\n".join([doc.page_content for doc in docs])
        messages = self._build_messages(context, question, history)

        # Calling llm.invoke() directly (rather than the prompt | llm pipe
        # operator) keeps this explicit and easy to unit test - the pipe
        # operator's Runnable coercion makes mocking the LLM in tests
        # unreliable.
        response = self.llm.invoke(messages)

        sources = list(set([
            doc.metadata.get("source", "unknown")
            for doc in docs
        ]))

        return {
            "answer": response.content,
            "sources": sources,
            "retrieved_chunks": len(docs),
            "citations": self._citations(docs),
        }

    def query_stream(self, question: str, k: int = 3,
                     history: Optional[list[dict]] = None) -> Iterator[dict]:
        """
        Same retrieval, but yields the answer as the model produces it.

        Yields event dicts in order:
          {"type": "retrieval", "citations": [...], "retrieved_chunks": n}
          {"type": "token", "text": "..."}          (many)
          {"type": "done", "sources": [...]}
          {"type": "error", "detail": "..."}        (on failure)

        The retrieval event lands before the first token, so the UI can show
        which passages the answer is being built from while it is still being
        written.
        """
        try:
            docs = self._retrieve(question, k)
        except Exception as exc:
            yield {"type": "error", "detail": f"Retrieval failed: {exc}"}
            return

        if not docs:
            yield {"type": "retrieval", "citations": [], "retrieved_chunks": 0}
            yield {"type": "token", "text": self.NO_MATCH}
            yield {"type": "done", "sources": []}
            return

        citations = self._citations(docs)
        yield {
            "type": "retrieval",
            "citations": citations,
            "retrieved_chunks": len(docs),
        }

        context = "\n\n".join([doc.page_content for doc in docs])
        messages = self._build_messages(context, question, history)

        try:
            for chunk in self.llm.stream(messages):
                text = getattr(chunk, "content", "")
                if text:
                    yield {"type": "token", "text": text}
        except Exception as exc:
            yield {"type": "error", "detail": f"Generation failed: {exc}"}
            return

        sources = list({c["source"] for c in citations})
        yield {"type": "done", "sources": sources}

    # ------------------------------------------------------------------ #
    # Index inspection
    # ------------------------------------------------------------------ #

    def get_document_count(self) -> int:
        """Get total number of chunks currently in the vector store."""
        return len(self.vector_store.store)

    def list_documents(self) -> list[dict]:
        """
        Group the indexed chunks by their source document.

        InMemoryVectorStore keeps everything in a plain dict, so this reads the
        store directly rather than running a search. It is the only way to tell
        the user what is currently queryable — there is no document table.
        """
        grouped: dict[str, dict] = {}

        for record in self.vector_store.store.values():
            meta = record.get("metadata") or {}
            source = meta.get("source", "unknown")

            entry = grouped.setdefault(source, {
                "source": source,
                "chunks": 0,
                "characters": 0,
                "pages": set(),
            })
            entry["chunks"] += 1
            entry["characters"] += len(record.get("text") or "")
            if meta.get("page") is not None:
                entry["pages"].add(meta["page"])

        out = []
        for entry in grouped.values():
            pages = entry.pop("pages")
            entry["page_count"] = len(pages) if pages else None
            out.append(entry)

        return sorted(out, key=lambda e: e["source"])

    def delete_source(self, source: str) -> int:
        """Remove every chunk belonging to one source. Returns how many went."""
        ids = [
            key for key, record in self.vector_store.store.items()
            if (record.get("metadata") or {}).get("source") == source
        ]
        if ids:
            self.vector_store.delete(ids=ids)
        return len(ids)

    def clear(self) -> int:
        """Empty the index entirely."""
        ids = list(self.vector_store.store.keys())
        if ids:
            self.vector_store.delete(ids=ids)
        return len(ids)
