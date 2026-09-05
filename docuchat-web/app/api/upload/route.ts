import { NextResponse } from "next/server";
import { ApiRequestError, uploadPdf } from "@/lib/api";

const MAX_BYTES = 20 * 1024 * 1024;

/** Proxies a PDF upload to the FastAPI backend, with the size and type
 *  checks done here so a bad file never reaches the extraction step. */
export async function POST(req: Request) {
  let form: FormData;

  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ detail: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ detail: "No file received" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ detail: "Only PDF files are supported" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ detail: "File is larger than 20 MB" }, { status: 413 });
  }

  try {
    const data = await uploadPdf(file);
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
