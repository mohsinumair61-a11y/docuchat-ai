import { ApiRequestError, askQuestionStream } from "@/lib/api";
import type { QueryRequest } from "@/types/docuchat";

/**
 * Pipes the backend's SSE stream straight to the browser.
 *
 * The response body is forwarded rather than awaited, so tokens reach the
 * client as the model produces them. Buffering here would defeat the point of
 * streaming at all.
 */
export async function POST(req: Request) {
  let body: Partial<QueryRequest>;

  try {
    body = (await req.json()) as Partial<QueryRequest>;
  } catch {
    return Response.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return Response.json({ detail: "A question is required" }, { status: 400 });
  }
  if (question.length > 2000) {
    return Response.json({ detail: "Question is too long" }, { status: 400 });
  }

  try {
    const upstream = await askQuestionStream({
      question,
      history: Array.isArray(body.history) ? body.history.slice(-6) : undefined,
    });

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    if (err instanceof ApiRequestError) {
      return Response.json({ detail: err.message }, { status: err.status });
    }
    return Response.json(
      { detail: "Could not reach the DocuChat API. Is the backend running?" },
      { status: 502 },
    );
  }
}
