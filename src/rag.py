"""
RAG Engine - Retrieval-Augmented Generation Logic
"""
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import ChatPromptTemplate
from langchain_core.vectorstores import InMemoryVectorStore
import os


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

    def query(self, question: str, k: int = 3, max_tokens: int = 500):
        """Retrieve the top-k relevant chunks and generate a grounded answer."""
        docs = self.vector_store.similarity_search(question, k=k)

        if not docs:
            return {
                "answer": "I couldn't find relevant information in the uploaded documents to answer that.",
                "sources": [],
                "retrieved_chunks": 0
            }

        context = "\n\n".join([doc.page_content for doc in docs])

        # System prompt explicitly instructs the model to stay grounded in
        # retrieved context rather than answering from its own general knowledge,
        # which is the core mechanism that reduces hallucination in RAG.
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a helpful assistant answering questions strictly using "
                       "the provided context from the user's uploaded documents. "
                       "If the context doesn't contain relevant information, say so "
                       "clearly instead of guessing."),
            ("user", "Context:\n{context}\n\nQuestion: {question}")
        ])

        # Calling llm.invoke() directly (rather than the prompt | llm pipe
        # operator) keeps this explicit and easy to unit test - the pipe
        # operator's Runnable coercion makes mocking the LLM in tests
        # unreliable.
        messages = prompt.format_messages(context=context, question=question)
        response = self.llm.invoke(messages)

        sources = list(set([
            doc.metadata.get("source", "unknown")
            for doc in docs
        ]))

        return {
            "answer": response.content,
            "sources": sources,
            "retrieved_chunks": len(docs)
        }

    def get_document_count(self) -> int:
        """Get total number of chunks currently in the vector store."""
        return len(self.vector_store.store)
