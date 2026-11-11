import { z } from "zod";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { chatgptStatus, classifyBatch, learnBatch, learnEstimate, setAuthor } from "@/lib/server/chatgpt";

export const maxDuration = 300;

export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const [status, estimate] = await Promise.all([chatgptStatus(), learnEstimate()]);
    return Response.json({ ...status, estimate });
  });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("classify") }),
  z.object({ action: z.literal("learn") }),
  z.object({ action: z.literal("author"), threadId: z.string().max(80), author: z.enum(["aditya", "mother", "unknown"]) }),
]);

/** classify / learn run one batch per call (the page loops with progress); author = his manual call. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const a = Action.parse(await req.json());
    if (a.action === "classify") return Response.json(await classifyBatch());
    if (a.action === "learn") return Response.json(await learnBatch());
    return Response.json(await setAuthor(a.threadId, a.author));
  });
}
