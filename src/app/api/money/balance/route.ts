import { handle, requireOwnerApi } from "@/lib/server/auth";
import { currentBalance, setBalance } from "@/lib/server/money";

/** "I'm left with 14k today": a check-in that later entries move up or down. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    await setBalance({ ...(await req.json()), via: "app" });
    return Response.json({ balance: await currentBalance() }, { status: 201 });
  });
}
