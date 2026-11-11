import { z } from "zod";
import { SENSITIVITY } from "@/lib/domain";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { bulkApprove } from "@/lib/server/memories";

const Body = z.object({ sensitivity: z.array(z.enum(SENSITIVITY)).min(1).max(3) });

export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const { sensitivity } = Body.parse(await req.json());
    return Response.json({ approved: await bulkApprove({ sensitivity }) });
  });
}
