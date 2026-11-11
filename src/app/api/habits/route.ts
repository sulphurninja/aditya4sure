import { handle, requireOwnerApi } from "@/lib/server/auth";
import { checkIn, clearCheckIn, HabitCheckinInput, habitBoard } from "@/lib/server/habits";

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    return Response.json(await habitBoard());
  });
}

/** Tap a habit for today: done true/false, or null to clear. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const { habitId, done, date } = HabitCheckinInput.parse(await req.json());
    if (done === null) await clearCheckIn(habitId, date ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
    else await checkIn(habitId, done, { date, via: "app" });
    return Response.json(await habitBoard());
  });
}
