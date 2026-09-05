import { NextResponse } from "next/server";
import { ApiRequestError, getStats } from "@/lib/api";

export async function GET() {
  try {
    return NextResponse.json(await getStats());
  } catch (err) {
    if (err instanceof ApiRequestError) {
      return NextResponse.json({ detail: err.message }, { status: err.status });
    }
    return NextResponse.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}
