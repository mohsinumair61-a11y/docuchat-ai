# Backend changes

Two files change and one function gets added. The frontend works without any of
this — it feature-detects and falls back — but these are what unlock streaming,
page-level citations and the document library.

## What you get

| Change | Effect |
|---|---|
| `query_stream()` + `POST /query/stream` | Answers arrive token by token instead of after a pause |
| `citations` in the response | The UI can show the exact passage each answer used |
| `add_pages()` + `extract_pages_from_pdf()` | Citations carry a page number |
| `list_documents()` + `GET /documents` | A real document library, not just this session's uploads |
| `delete_source()` + `DELETE /documents/{source}` | Remove a document without restarting |
| `history` on the query request | Follow-up questions resolve ("and the second one?") |
| `GET /capabilities` | The frontend can tell what this build supports |
| Sample docs removed from `lifespan` | No more `sample_data` citations on real answers |

## Applying it

1. Replace `src/rag.py` with the one in this folder.
2. Replace `src/main.py` with the one in this folder.
3. Add the function from `src/document_loader_addition.py` to your existing
   `src/document_loader.py`. This one is optional — without it, uploads still
   work and pages stay null.

Nothing else changes. `embeddings.py` and the existing
`extract_text_from_pdf` are untouched.

## What was verified

`test_rag.py` runs the engine against a fake embedding function and a stubbed
LLM, so it needs no Gemini key:

```bash
python3 test_rag.py
```

It checks page-aware indexing, citation shape, streaming event order, history
being accepted, deletion, and that an empty index answers sensibly rather than
erroring.

The FastAPI layer's shape was verified against the frontend, but the live
Gemini streaming path could not be — that needs your key. Run it once and
confirm tokens actually arrive incrementally rather than in one lump.

## How streaming works

`query_stream()` yields dicts; `/query/stream` serialises each as one SSE frame:

```
data: {"type":"retrieval","citations":[...],"retrieved_chunks":3}
data: {"type":"token","text":"Cloud "}
data: {"type":"token","text":"computing "}
data: {"type":"done","sources":["notes.pdf"]}
```

The `retrieval` event lands before the first token, so the UI shows which
passages the answer is being built from while it is still being written.

`X-Accel-Buffering: no` is set on the response. Without it nginx collects the
whole stream and delivers it in one lump, which looks exactly like streaming
being broken.

## Why page numbers need the loader change

`extract_text_from_pdf` returns the whole document as one string, so a chunk
spanning a page break has no single correct page to point at. `add_pages()`
chunks *within* each page instead, which is what makes "policy.pdf, page 4"
truthful rather than approximate.

Empty pages are skipped but still consume their number, so page 3 in a citation
is page 3 in the PDF.

## Still worth doing

- **Persist the index.** `InMemoryVectorStore` loses everything on restart.
  Chroma on disk or pgvector would fix it, and `list_documents()` already reads
  through an interface both support.
- **Auth.** `DELETE /documents` is open to anyone who can reach the API.
- **Rate limiting** on `/query`, since every call costs a Gemini request.
