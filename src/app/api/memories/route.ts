import { handle, requireOwnerApi } from "@/lib/server/auth";
import { createMemory, listMemories } from "@/lib/server/memories";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const params = Object.fromEntries(new URL(req.url).searchParams);
    return Response.json({ memories: await listMemories(params) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ memory: await createMemory(await req.json()) }, { status: 201 });
  });
}
