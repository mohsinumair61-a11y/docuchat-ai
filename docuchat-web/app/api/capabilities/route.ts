import { getCapabilities } from "@/lib/api";

export async function GET() {
  return Response.json(await getCapabilities());
}
