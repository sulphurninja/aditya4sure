import { TASK_AREAS, TASK_STATUS, type TaskArea, type TaskStatus } from "@/lib/domain";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { createTask, listTasks } from "@/lib/server/tasks";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const p = new URL(req.url).searchParams;
    const status = p.get("status");
    const area = p.get("area");
    return Response.json({
      tasks: await listTasks({
        status: status === "all" || (TASK_STATUS as readonly string[]).includes(status ?? "") ? (status as TaskStatus | "all") : "open",
        area: (TASK_AREAS as readonly string[]).includes(area ?? "") ? (area as TaskArea) : undefined,
        entity: p.get("entity")?.slice(0, 80) || undefined,
        q: p.get("q")?.slice(0, 100) || undefined,
      }),
    });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const body = await req.json();
    return Response.json({ task: await createTask({ ...body, source: "app" }) }, { status: 201 });
  });
}
