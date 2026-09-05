"""
Document Loader - Extract text from uploaded PDF files
"""
from pypdf import PdfReader
import io


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extract plain text from an in-memory PDF file.

    Args:
        file_bytes: Raw bytes of the uploaded PDF.

    Returns:
        str: Concatenated text from all pages.
    """
    reader = PdfReader(io.BytesIO(file_bytes))
    pages_text = []

    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages_text.append(text)

    return "\n\n".join(pages_text)



def extract_pages_from_pdf(file_bytes: bytes) -> list[str]:
    """
    Extract text page by page, keeping the page boundaries.

    extract_text_from_pdf() joins everything into one string, which loses
    which page a piece of text came from. Chunking then happens across page
    breaks and a citation has no page to point at.

    Returning a list instead lets the RAG engine chunk within each page, so
    every chunk carries a page number and a citation can say "page 4".

    Args:
        file_bytes: Raw bytes of the uploaded PDF.

    Returns:
        list[str]: Text of each page, in order. Empty pages stay as empty
        strings so a list index still matches the real page number.
    """
    reader = PdfReader(io.BytesIO(file_bytes))
    return [(page.extract_text() or "") for page in reader.pages]