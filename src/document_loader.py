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
