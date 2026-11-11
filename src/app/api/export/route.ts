import { OWNER_ID } from "@/lib/domain";
import { audit } from "@/lib/server/audit";
import { handle, requireOwnerApi } from "@/lib/server/auth";
import { collections, nowIso } from "@/lib/server/db";

/** Full data export, everything the brain stores about you, as JSON. */
export async function GET(req: Request) {
  return handle(async () => {
    await requireOwnerApi(req);
    const c = await collections();
    const [memories, entities, edges, conversations, proposals, styleSamples, auditLog] = await Promise.all([
      c.memories.find({ ownerId: OWNER_ID }).toArray(),
      c.entities.find({ ownerId: OWNER_ID }).toArray(),
      c.edges.find({ ownerId: OWNER_ID }).toArray(),
      c.conversations.find({ ownerId: OWNER_ID }).toArray(),
      c.proposals.find({ ownerId: OWNER_ID }).toArray(),
      c.styleSamples.find({ ownerId: OWNER_ID }).toArray(),
      c.audit.find({ ownerId: OWNER_ID }).sort({ at: -1 }).limit(5000).toArray(),
    ]);
    await audit({ actor: "owner", action: "data.export", targetType: "export", targetId: "all" });
    const body = JSON.stringify({ exportedAt: nowIso(), memories, entities, edges, conversations, proposals, styleSamples, auditLog }, null, 2);
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="aditya-brain-export-${nowIso().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
