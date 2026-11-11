import { handle, requireOwnerApi } from "@/lib/server/auth";
import { createGoal, listGoals } from "@/lib/server/money";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ goals: await listGoals(true) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ goal: await createGoal(await req.json()) }, { status: 201 });
  });
}
