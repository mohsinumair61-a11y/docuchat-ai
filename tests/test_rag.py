"""
Unit tests for RAG functionality
"""
import pytest
from unittest.mock import Mock, patch
from src.rag import RAGEngine


@pytest.fixture
def mock_vector_store():
    """Create a mock vector store"""
    mock_store = Mock()
    mock_store.store = {}
    yield mock_store


@pytest.fixture
def rag_engine(mock_vector_store):
    """Create a RAG engine instance with a mocked Gemini chat model"""
    with patch('src.rag.ChatGoogleGenerativeAI'):
        return RAGEngine(mock_vector_store)


def test_add_document(rag_engine, mock_vector_store):
    """Test adding a document to the vector store"""
    test_text = "This is a test document."
    test_metadata = {"source": "test"}

    rag_engine.add_document(test_text, test_metadata)

    assert mock_vector_store.add_texts.called


def test_query_with_no_results(rag_engine, mock_vector_store):
    """Test querying when nothing matches in the vector store"""
    mock_vector_store.similarity_search.return_value = []

    result = rag_engine.query("What is this document about?")

    assert "couldn't find" in result["answer"].lower()
    assert result["sources"] == []


def test_query_with_results(rag_engine, mock_vector_store):
    """Test querying with matching document chunks"""
    mock_doc = Mock()
    mock_doc.page_content = "DocuChat AI lets you query uploaded PDFs."
    mock_doc.metadata = {"source": "sample.pdf"}

    mock_vector_store.similarity_search.return_value = [mock_doc]

    with patch.object(rag_engine.llm, 'invoke') as mock_invoke:
        mock_response = Mock()
        mock_response.content = "DocuChat AI is a tool for querying uploaded PDFs."
        mock_invoke.return_value = mock_response

        result = rag_engine.query("What does DocuChat AI do?")

        assert "docuchat" in result["answer"].lower()
        assert "sample.pdf" in result["sources"]


def test_get_document_count(rag_engine, mock_vector_store):
    """Test getting the current chunk count"""
    mock_vector_store.store = {"1": {}, "2": {}, "3": {}}

    count = rag_engine.get_document_count()
    assert count == 3


def test_health_endpoint():
    """Test the health check endpoint"""
    from fastapi.testclient import TestClient
    from src.main import app

    client = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200
    assert "status" in response.json()
