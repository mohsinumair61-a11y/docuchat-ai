import { ApiRequestError, deleteDocument, listDocuments } from "@/lib/api";

export async function GET() {
  try {
    return Response.json(await listDocuments());
  } catch (err) {
    if (err instanceof ApiRequestError) {
      return Response.json({ detail: err.message }, { status: err.status });
    }
    return Response.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const source = new URL(req.url).searchParams.get("source");
  if (!source) {
    return Response.json({ detail: "source is required" }, { status: 400 });
  }

  try {
    await deleteDocument(source);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiRequestError) {
      return Response.json({ detail: err.message }, { status: err.status });
    }
    return Response.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}
