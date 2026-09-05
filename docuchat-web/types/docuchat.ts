/**
 * Types mirroring the FastAPI response models in src/main.py.
 * If a Pydantic model changes on the backend, change it here too.
 */

export interface QueryRequest {
  question: string;
  max_tokens?: number;
  /** Optional. Sent only if the backend advertises conversation support. */
  history?: { role: Role; content: string }[];
}

/** A single retrieved passage. `text` and `page` are optional because the
 *  current backend returns sources as plain strings; both appear once
 *  RAGEngine.query returns chunk metadata. See BACKEND.md. */
export interface Citation {
  source: string;
  page?: number | null;
  chunk_index?: number | null;
  text: string;
}

export interface QueryResponse {
  answer: string;
  sources: string[];
  retrieved_chunks: number;
  /** Optional richer citations, if the backend provides them. */
  citations?: Citation[];
}

export interface UploadResponse {
  message: string;
  characters_extracted: number;
}

export interface StatsResponse {
  total_chunks: number;
  model: string;
}

export interface ApiError {
  detail: string;
}

/* ---------- Client-side view models ---------- */

export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  sources?: string[];
  citations?: Citation[];
  retrievedChunks?: number;
  createdAt: number;
  /** Set when the request failed, so the message can be retried. */
  error?: string;
}

export interface IndexedDoc {
  id: string;
  filename: string;
  charactersExtracted: number;
  uploadedAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export type Phase = "idle" | "retrieving" | "writing";

export type Theme = "light" | "dark" | "system";
