import { NextResponse } from "next/server";
import { ApiRequestError, askQuestion } from "@/lib/api";
import type { QueryRequest } from "@/types/docuchat";

/**
 * Proxies /query to the FastAPI backend.
 *
 * The browser talks to this route, never to FastAPI directly. That keeps the
 * backend URL and any future API key server-side, and gives one place to
 * validate input before it reaches the RAG engine.
 */
export async function POST(req: Request) {
  let body: Partial<QueryRequest>;

  try {
    body = (await req.json()) as Partial<QueryRequest>;
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ detail: "A question is required" }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ detail: "Question is too long" }, { status: 400 });
  }

  try {
    const data = await askQuestion({
      question,
      max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 500,
    });
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ApiRequestError) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { detail: "Could not reach the DocuChat API. Is the backend running?" },
      { status: 502 },
    );
  }
}
