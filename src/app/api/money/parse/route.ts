import { z } from "zod";
import { handle, HttpError, requireOwnerApi } from "@/lib/server/auth";
import { describeLlmError, llmInfo } from "@/lib/server/llm";
import { parseMoneyText } from "@/lib/server/money";

/** "spent 450 on uber, harsh owes me 5k" -> draft entries. Nothing is saved until he confirms. */
export async function POST(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const { text } = z.object({ text: z.string().trim().min(2).max(2000) }).parse(await req.json());
    if (!llmInfo().configured) throw new HttpError(503, "no model key configured, use the manual form");
    try {
      const { entries, goals, balance } = await parseMoneyText(text);
      return Response.json({ drafts: entries, goals, balance });
    } catch (err) {
      throw new HttpError(502, describeLlmError(err));
    }
  });
}
