import { handle, requireOwnerApi } from "@/lib/server/auth";
import { addDate, allDates, deleteDate, refreshImportantDates } from "@/lib/server/people";

export const maxDuration = 120;

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json({ dates: await allDates() });
  });
}

/** { refresh: true } re-reads the brain for birthdays/anniversaries; otherwise adds a date by hand. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const body = await req.json();
    if (body?.refresh) {
      const r = await refreshImportantDates();
      return Response.json({ ...r, dates: await allDates() });
    }
    await addDate(body);
    return Response.json({ dates: await allDates() }, { status: 201 });
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const id = new URL(req.url).searchParams.get("id");
    if (id) await deleteDate(id.slice(0, 40));
    return Response.json({ dates: await allDates() });
  });
}
